import { logger } from '../logging/logger';
import crypto from 'node:crypto';
import https from 'node:https';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';

export interface ArtifactMeta {
  file: string;
  sha256: string;
  size: number;
  platform: string;
  arch: string;
}

export interface ReleaseManifest {
  version: string;
  protocolVersion: number;
  releasedAt: string;
  artifacts: Record<string, ArtifactMeta>;
  notes?: string;
}

export interface ReleaseMetadata {
  currentVersion: string;
  latestVersion: string;
  protocolVersion: number;
  releaseUrl: string;
  artifacts: Record<string, ArtifactMeta>;
  signatureStatus: 'valid' | 'invalid' | 'missing' | 'unchecked';
}

const FETCH_TIMEOUT_MS = 15_000;
const MAX_MANIFEST_BYTES = 64 * 1024; // 64 KB ceiling

export type ReleaseChannel = 'stable' | 'beta';

export function getUpdateBaseUrl(channel: ReleaseChannel): string {
  if (process.env.TRAFFICBOT_UPDATE_BASE_URL) return process.env.TRAFFICBOT_UPDATE_BASE_URL;
  if (channel === 'stable') {
    return 'https://github.com/lucasveneno/trafficbot/releases/latest/download';
  }
  return ''; // Resolved dynamically
}

export function validateManifestSchema(obj: unknown): obj is ReleaseManifest {
  if (!obj || typeof obj !== 'object') return false;
  const m = obj as Record<string, unknown>;
  if (typeof m.version !== 'string' || !m.version) return false;
  if (typeof m.protocolVersion !== 'number') return false;
  if (typeof m.releasedAt !== 'string') return false;
  if (!m.artifacts || typeof m.artifacts !== 'object') return false;
  for (const [, art] of Object.entries(m.artifacts as Record<string, unknown>)) {
    const a = art as Record<string, unknown>;
    if (typeof a.file !== 'string' || !a.file) return false;
    if (typeof a.sha256 !== 'string' || !a.sha256) return false;
    if (typeof a.size !== 'number') return false;
    if (typeof a.platform !== 'string') return false;
    if (typeof a.arch !== 'string') return false;
  }
  return true;
}

/** Fetch a small text resource over HTTPS with a timeout. */
export function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https://') ? https : http;
    let body = '';
    let size = 0;
    const req = lib.get(url, { timeout: FETCH_TIMEOUT_MS, headers: { 'User-Agent': 'Trafficbot-Updater/1.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        fetchText(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
      }
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        size += Buffer.byteLength(chunk);
        if (size > MAX_MANIFEST_BYTES) {
          res.destroy();
          return reject(new Error(`Manifest response too large (>${MAX_MANIFEST_BYTES} bytes)`));
        }
        body += chunk;
      });
      res.on('end', () => resolve(body));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Manifest fetch timed out')); });
  });
}

export class ReleaseManager {
  static PUBLIC_KEY: string = process.env.RELEASE_PUBLIC_KEY || '';
  static channel: ReleaseChannel = 'stable';
  static resolvedBaseUrl: string = '';
  private static cachedManifest: ReleaseManifest | null = null;
  private static signatureStatus: 'valid' | 'invalid' | 'missing' | 'unchecked' = 'unchecked';
  private static fetchTimer: NodeJS.Timeout | null = null;

  static async initialize() {
    await this.refresh();
    if (this.fetchTimer) clearInterval(this.fetchTimer);
    this.fetchTimer = setInterval(() => { void this.refresh(); }, 30 * 60 * 1000);
    this.fetchTimer.unref?.();
  }

  static async close() {
    if (this.fetchTimer) { clearInterval(this.fetchTimer); this.fetchTimer = null; }
  }

  static async refresh() {
    try {
      // 1. Try local dist/ first (CI dry-run / dev / tests)
      const root = path.resolve(__dirname, '../../..');
      const localPath = path.join(root, 'dist/workers/manifest.json');

      let manifestStr: string | null = null;
      let sigStr: string | null = null;
      let fromNetwork = false;

      const useLocal = !process.env.TRAFFICBOT_UPDATE_BASE_URL;

      try {
        if (!useLocal) throw new Error('Skipping local fetch');
        manifestStr = await fs.readFile(localPath, 'utf8');
        sigStr = await fs.readFile(localPath + '.sig', 'utf8').catch(() => null);
      } catch {
        // No local copy — try network
        try {
          let baseUrl = getUpdateBaseUrl(this.channel);
          if (!baseUrl && this.channel === 'beta') {
            const apiRes = await fetchText('https://api.github.com/repos/lucasveneno/trafficbot/releases');
            const releases = JSON.parse(apiRes);
            const latestBeta = releases.find((r: any) => r.prerelease || r.tag_name.includes('beta') || r.tag_name.includes('test'));
            if (!latestBeta) throw new Error('No beta release found');
            baseUrl = `https://github.com/lucasveneno/trafficbot/releases/download/${latestBeta.tag_name}`;
          }
          if (!baseUrl) throw new Error('Unable to resolve base URL');
          manifestStr = await fetchText(`${baseUrl}/manifest.json`);
          sigStr = await fetchText(`${baseUrl}/manifest.json.sig`).catch(() => null);
          fromNetwork = true;
          this.resolvedBaseUrl = baseUrl;
        } catch (netErr) {
          logger.warn('ReleaseManager: could not fetch manifest from network', { error: String(netErr) });
          return; // Keep last cached values
        }
      }

      if (!manifestStr) return;

      // 2. Parse + validate schema (before trusting anything)
      let parsed: unknown;
      try { parsed = JSON.parse(manifestStr); } catch {
        logger.warn('ReleaseManager: manifest JSON parse failed'); return;
      }
      if (!validateManifestSchema(parsed)) {
        logger.warn('ReleaseManager: manifest schema validation failed'); return;
      }

      // 3. Verify ECDSA signature
      let newSigStatus: typeof this.signatureStatus = 'unchecked';
      if (sigStr && this.PUBLIC_KEY) {
        try {
          const verify = crypto.createVerify('SHA256');
          verify.update(manifestStr);
          verify.end();
          newSigStatus = verify.verify(this.PUBLIC_KEY, sigStr, 'base64') ? 'valid' : 'invalid';
        } catch {
          newSigStatus = 'invalid';
        }
      } else if (!sigStr) {
        newSigStatus = 'missing';
      }

      // Only update cached manifest after all validation
      this.cachedManifest = parsed;
      this.signatureStatus = newSigStatus;

      logger.info(
        `ReleaseManager: manifest v${this.cachedManifest.version} ` +
        `(${fromNetwork ? 'network' : 'local'}, sig=${this.signatureStatus})`,
      );
    } catch (e) {
      logger.warn('ReleaseManager: refresh error', { error: String(e) });
    }
  }

  static getMetadata(currentVersion: string): ReleaseMetadata | null {
    if (!this.cachedManifest) return null;
    return {
      currentVersion,
      latestVersion: this.cachedManifest.version,
      protocolVersion: this.cachedManifest.protocolVersion,
      releaseUrl: this.resolvedBaseUrl || `https://github.com/lucasveneno/trafficbot/releases/tag/v${this.cachedManifest.version}`,
      artifacts: this.cachedManifest.artifacts,
      signatureStatus: this.signatureStatus,
    };
  }
}
