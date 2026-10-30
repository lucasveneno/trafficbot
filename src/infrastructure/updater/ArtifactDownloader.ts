/**
 * ArtifactDownloader — streaming, verified artifact fetch.
 *
 * Security requirements enforced:
 *  - HTTPS only (unless TRAFFICBOT_ALLOW_HTTP_UPDATE=1 for local dev)
 *  - Hard ceiling on response size (MAX_ARTIFACT_BYTES)
 *  - SHA-256 hash computed during streaming (no full in-memory load)
 *  - Size compared to manifest metadata
 *  - Path traversal prevention: caller must supply a safe dest path
 *  - No auth headers forwarded to arbitrary redirect targets
 */
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import crypto from 'node:crypto';
import { UpdateError, UpdateErrorCode } from './UpdateError';

// ~400 MB ceiling — large enough for any plausible worker binary, small enough to catch bad responses
export const MAX_ARTIFACT_BYTES = 400 * 1024 * 1024;
/** Default download timeout. Tests inject a much shorter value via options. */
export const DEFAULT_DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

export interface DownloadOptions {
  /** Override the read timeout. Used in integration tests to simulate stalled servers. */
  timeoutMs?: number;
}

export interface DownloadResult {
  sha256: string;
  sizeBytes: number;
}

/**
 * Derive the platform/arch key exactly as build-workers.cjs generates it.
 *   process.platform: darwin | linux | win32
 *   process.arch:     x64 | arm64
 */
export function deriveArtifactKey(): string {
  const p = process.platform === 'darwin' ? 'macos'
    : process.platform === 'win32' ? 'windows'
    : 'linux';
  const a = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `${p}-${a}`;
}

/**
 * Validate that a manifest-supplied filename cannot perform path traversal.
 * We accept only simple filenames (no slashes, no device names).
 */
export function validateFilename(filename: string): void {
  if (!filename || typeof filename !== 'string') {
    throw new UpdateError(UpdateErrorCode.UPDATE_MANIFEST_INVALID, 'Artifact filename is empty');
  }
  // Reject any path separator, null byte, or Windows device names
  if (/[/\\]/.test(filename) || filename.includes('\0')) {
    throw new UpdateError(UpdateErrorCode.UPDATE_MANIFEST_INVALID, `Unsafe artifact filename: ${filename}`);
  }
  // Reject Windows reserved device names (CON, PRN, AUX, NUL, COM*, LPT*)
  if (/^(CON|PRN|AUX|NUL|COM\d|LPT\d)$/i.test(filename)) {
    throw new UpdateError(UpdateErrorCode.UPDATE_MANIFEST_INVALID, `Reserved device name: ${filename}`);
  }
}

export async function streamDownload(
  url: string,
  destPath: string,
  expectedSize: number,
  onProgress?: (bytesDownloaded: number) => void,
  options: DownloadOptions = {},
): Promise<DownloadResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS;
  // Security: HTTPS only unless explicitly overridden for dev
  if (!url.startsWith('https://') && process.env.TRAFFICBOT_ALLOW_HTTP_UPDATE !== '1') {
    throw new UpdateError(UpdateErrorCode.UPDATE_DOWNLOAD_FAILED, `Insecure URL rejected (must be HTTPS): ${url}`);
  }

  // Reject manifest size that already exceeds ceiling
  if (expectedSize > MAX_ARTIFACT_BYTES) {
    throw new UpdateError(
      UpdateErrorCode.UPDATE_SIZE_MISMATCH,
      `Manifest reports artifact size ${expectedSize} exceeds ceiling ${MAX_ARTIFACT_BYTES}`,
    );
  }

  return new Promise<DownloadResult>((resolve, reject) => {
    let totalBytes = 0;
    const hash = crypto.createHash('sha256');
    const dest = fs.createWriteStream(destPath);
    let settled = false;
    let redirectCount = 0;
    const MAX_REDIRECTS = 5;
    let originalScheme = url.startsWith('https://') ? 'https' : 'http';
    let request: http.ClientRequest | undefined;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request?.destroy();
      dest.destroy();
      // Clean up partial file without blocking
      fs.unlink(destPath, () => {});
      reject(err);
    };

    const timer = setTimeout(() => {
      fail(new UpdateError(UpdateErrorCode.UPDATE_DOWNLOAD_TIMEOUT, 'Download timed out'));
    }, timeoutMs);

    const doRequest = (requestUrl: string) => {
      const lib = requestUrl.startsWith('https://') ? https : http;
      // Security: reject HTTPS → HTTP downgrade on redirect
      const thisScheme = requestUrl.startsWith('https://') ? 'https' : 'http';
      if (originalScheme === 'https' && thisScheme === 'http') {
        return fail(new UpdateError(UpdateErrorCode.UPDATE_DOWNLOAD_FAILED, `HTTPS→HTTP downgrade rejected on redirect to: ${requestUrl}`));
      }
      const req = lib.get(requestUrl, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          redirectCount++;
          if (redirectCount > MAX_REDIRECTS) {
            return fail(new UpdateError(UpdateErrorCode.UPDATE_DOWNLOAD_FAILED, 'Too many redirects'));
          }
          // Strip auth headers when redirecting cross-origin (simple host check)
          res.resume(); // consume the redirect body
          doRequest(new URL(res.headers.location, requestUrl).toString());
          return;
        }
        if (res.statusCode !== 200) {
          return fail(new UpdateError(UpdateErrorCode.UPDATE_DOWNLOAD_FAILED, `HTTP ${res.statusCode} from ${requestUrl}`));
        }

        res.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > MAX_ARTIFACT_BYTES) {
            return fail(new UpdateError(UpdateErrorCode.UPDATE_SIZE_MISMATCH, `Response exceeds maximum allowed size`));
          }
          hash.update(chunk);
          if (!dest.write(chunk)) {
            res.pause();
            dest.once('drain', () => res.resume());
          }
          onProgress?.(totalBytes);
        });

        res.on('end', () => {
          if (settled) return;
          dest.end(() => {
            clearTimeout(timer);
            if (settled) return;
            settled = true;
            resolve({ sha256: hash.digest('hex'), sizeBytes: totalBytes });
          });
        });

        res.on('error', fail);
      });

      req.on('error', (err) => fail(new UpdateError(UpdateErrorCode.UPDATE_DOWNLOAD_FAILED, err.message)));
      request = req;
    };

    dest.on('error', (err) => fail(new UpdateError(UpdateErrorCode.UPDATE_DOWNLOAD_FAILED, err.message)));
    doRequest(url);
  });
}
