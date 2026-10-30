/**
 * WorkerUpdater — real, staged self-update lifecycle.
 *
 * Lifecycle:
 *   draining → waiting_for_sessions → fetching_manifest → downloading →
 *   verifying → preparing → installing → restarting → (completed | failed)
 *
 * Security guarantees:
 *   - Manifest signature verified before any artifact URL is trusted
 *   - Artifact downloaded to a temp dir — never over the running binary
 *   - SHA-256 verified after streaming download
 *   - Size compared against manifest metadata
 *   - Path-traversal-safe artifact naming
 *   - File-based lock prevents concurrent updates
 *   - Dev-mode detection: refuses to replace interpreter (node/bun/tsx)
 *   - Protocol compatibility checked before install
 *   - Rollback copy kept from previous working binary
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { logger } from '../logging/logger';
import { QueueService } from '../queue/QueueService';
import { WorkerRegistry } from './WorkerRegistry';
import { ReleaseManager } from '../updater/ReleaseManager';
import { UpdateError, UpdateErrorCode } from '../updater/UpdateError';
import { WorkerUpdateState, UpdateEvent } from '../updater/UpdateState';
import { streamDownload, deriveArtifactKey, validateFilename } from '../updater/ArtifactDownloader';
import { AtomicReplacer, computeFileSha256 } from '../updater/AtomicReplacer';
import { APPLICATION_VERSION, PROTOCOL_VERSION, COMPATIBILITY } from '../../domain/Protocol';

// ── constants ────────────────────────────────────────────────────────────────
const DRAIN_TIMEOUT_MS = 5 * 60 * 1000;           // 5 minutes to drain active sessions
const SESSION_POLL_INTERVAL_MS = 2_000;

// Names that indicate the process is running inside a dev interpreter — not a compiled binary
const DEV_INTERPRETER_NAMES = new Set(['node', 'bun', 'tsx', 'ts-node', 'jest', 'vitest']);

// ── helpers ──────────────────────────────────────────────────────────────────
function workerConfigDir(): string {
  return process.env.TRAFFICBOT_WORKER_CONFIG_DIR || path.join(os.homedir(), '.trafficbot-worker');
}

function updateDir(): string {
  return path.join(workerConfigDir(), 'update');
}

function lockFilePath(): string {
  return path.join(workerConfigDir(), 'update.lock');
}

function pendingMarkerPath(): string {
  return path.join(workerConfigDir(), 'update-pending.json');
}

/** Detect whether we are running as a compiled standalone binary vs. a dev interpreter. */
function isCompiledBinary(): boolean {
  const execName = path.basename(process.execPath, path.extname(process.execPath)).toLowerCase();
  return !DEV_INTERPRETER_NAMES.has(execName);
}

/** Acquire an exclusive file-based lock. Returns a release function. */
async function acquireLock(): Promise<() => Promise<void>> {
  const lock = lockFilePath();
  await fs.mkdir(path.dirname(lock), { recursive: true });
  try {
    // O_EXCL: fails if file already exists — acts as a mutex
    const fh = await fs.open(lock, 'wx');
    await fh.writeFile(String(process.pid));
    await fh.close();
  } catch {
    // Check whether the lock holder is still alive
    try {
      const pid = Number(await fs.readFile(lock, 'utf8'));
      let isAlive = false;
      try {
        if (pid) isAlive = process.kill(pid, 0);
      } catch (killErr) {
        isAlive = false;
      }
      
      if (isAlive) {
        throw new UpdateError(UpdateErrorCode.UPDATE_ALREADY_RUNNING, 'Another update is already in progress');
      }
      
      // Stale lock — remove and retry
      await fs.rm(lock, { force: true });
      const fh = await fs.open(lock, 'wx');
      await fh.writeFile(String(process.pid));
      await fh.close();
    } catch (e) {
      if (e instanceof UpdateError) throw e;
      throw new UpdateError(UpdateErrorCode.UPDATE_ALREADY_RUNNING, 'Failed to acquire update lock');
    }
  }
  return async () => { await fs.rm(lock, { force: true }); };
}

/** Wait until active sessions for this worker reach zero, with a bounded timeout. */
async function waitForDrain(workerId: string): Promise<void> {
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    // WorkerRegistry tracks the in-memory heartbeat; active count from Redis heartbeat key
    const redis = QueueService.getRedis();
    if (redis) {
      const raw = await redis.get(`traffic:workers:${workerId}`);
      if (raw) {
        const data = JSON.parse(raw);
        if ((data.activeSessions ?? 0) === 0) return;
      } else {
        // Key expired or worker not found — treat as drained
        return;
      }
    } else {
      return; // No Redis, proceed optimistically
    }
    await new Promise(r => setTimeout(r, SESSION_POLL_INTERVAL_MS));
  }
  throw new UpdateError(UpdateErrorCode.UPDATE_DRAIN_TIMEOUT, `Sessions did not finish draining within ${DRAIN_TIMEOUT_MS / 1000}s`);
}

// ── main class ───────────────────────────────────────────────────────────────
export class WorkerUpdater {
  private static currentState: WorkerUpdateState = 'idle';
  private static currentUpdateId: string | null = null;
  private static beforeRestartHook: (() => Promise<void>) | null = null;

  static getState(): WorkerUpdateState { return this.currentState; }
  static getUpdateId(): string | null { return this.currentUpdateId; }
  static setBeforeRestartHook(hook: (() => Promise<void>) | null): void {
    this.beforeRestartHook = hook;
  }

  static async initialize(): Promise<void> {
    const cleanStaleFiles = async () => {
      try {
        const dir = path.dirname(process.execPath);
        await fs.rm(path.join(dir, 'trafficbot-worker.new'), { force: true }).catch(() => {});
        const entries = await fs.readdir(dir).catch(() => [] as string[]);
        for (const file of entries) {
          if (file.includes('.rollback_stale') || file.includes('.retired.') || file.includes('.new.')) {
            await fs.rm(path.join(dir, file), { force: true }).catch(() => {});
          }
        }
        if (os.platform() === 'win32') {
          const tmp = os.tmpdir();
          const files = await fs.readdir(tmp);
          for (const file of files) {
            if (file.startsWith('trafficbot-update-') && file.endsWith('.ps1')) {
              await fs.rm(path.join(tmp, file), { force: true }).catch(() => {});
            }
          }
        }
      } catch {}
    };
    await cleanStaleFiles();
    setTimeout(() => { void cleanStaleFiles(); }, 2000).unref?.();
  }

  // ── public API ──────────────────────────────────────────────────────────

  static async executeUpdate(workerId: string): Promise<void> {
    if (this.currentState !== 'idle' && this.currentState !== 'failed'
        && this.currentState !== 'completed' && this.currentState !== 'rollback_available') {
      throw new UpdateError(UpdateErrorCode.UPDATE_ALREADY_RUNNING, `Update already in state: ${this.currentState}`);
    }

    const updateId = randomUUID();
    this.currentUpdateId = updateId;
    const fromVersion = APPLICATION_VERSION;
    let releaseLock: (() => Promise<void>) | null = null;

    const emit = async (state: WorkerUpdateState, extra?: Partial<UpdateEvent>) => {
      this.currentState = state;
      const event: UpdateEvent = {
        workerId, updateId, state, fromVersion, targetVersion: null,
        startedAt: new Date().toISOString(), ...extra,
      };
      logger.info('worker.update.event', event as any);
      // Publish event to Redis for Control Server consumption
      const redis = QueueService.getRedis();
      await redis?.publish(`traffic:worker:${workerId}:update-events`, JSON.stringify(event)).catch(() => {});
    };

    try {
      // ── dev mode guard ──────────────────────────────────────────────────
      if (!isCompiledBinary()) {
        emit('failed', { errorCode: UpdateErrorCode.UPDATE_DEV_MODE });
        throw new UpdateError(UpdateErrorCode.UPDATE_DEV_MODE,
          'Self-update unavailable in dev mode (running under interpreter). Build a compiled binary first.');
      }

      releaseLock = await acquireLock();

      // ── 1. Drain ────────────────────────────────────────────────────────
      emit('draining');
      logger.info(`[update:${updateId}] Draining worker ${workerId}`);
      await QueueService.pauseWorker(workerId);
      const caps = WorkerRegistry.getCurrentCapabilities(workerId);
      if (caps) { caps.status = 'draining'; await WorkerRegistry.registerWorker(caps); }

      // ── 2. Wait for sessions ────────────────────────────────────────────
      emit('waiting_for_sessions');
      logger.info(`[update:${updateId}] Waiting for active sessions to finish`);
      await waitForDrain(workerId);

      // ── 3. Fetch & verify manifest ──────────────────────────────────────
      emit('fetching_manifest');
      logger.info(`[update:${updateId}] Fetching signed release manifest`);
      await ReleaseManager.refresh();
      const meta = ReleaseManager.getMetadata(APPLICATION_VERSION);
      if (!meta) {
        throw new UpdateError(UpdateErrorCode.UPDATE_MANIFEST_UNAVAILABLE,
          'Release metadata not available. Run ReleaseManager.refresh() first.');
      }
      if (meta.signatureStatus === 'invalid') {
        throw new UpdateError(UpdateErrorCode.UPDATE_SIGNATURE_INVALID, 'Release manifest signature is invalid');
      }
      if (meta.signatureStatus === 'missing') {
        throw new UpdateError(UpdateErrorCode.UPDATE_SIGNATURE_INVALID, 'Release manifest signature is missing');
      }

      // ── 4. Protocol compatibility guard ────────────────────────────────
      const targetProtocol = meta.protocolVersion;
      if (targetProtocol > COMPATIBILITY.MAX_PROTOCOL) {
        throw new UpdateError(UpdateErrorCode.UPDATE_SERVER_UPGRADE_REQUIRED,
          `Target worker protocolVersion ${targetProtocol} exceeds server max ${COMPATIBILITY.MAX_PROTOCOL}`);
      }

      // ── 5. Find matching artifact ────────────────────────────────────────
      const artifactKey = deriveArtifactKey();
      const artifact = meta.artifacts[artifactKey];
      if (!artifact) {
        throw new UpdateError(UpdateErrorCode.UPDATE_ARTIFACT_NOT_FOUND,
          `No artifact for platform key '${artifactKey}' in manifest`);
      }
      validateFilename(artifact.file);

      const targetVersion = meta.latestVersion;

      // ── 6. Downgrade prevention ─────────────────────────────────────────
      // Use simple string comparison against semver for now (full semver lib would be better)
      if (!isNewerVersion(targetVersion, APPLICATION_VERSION)) {
        throw new UpdateError(UpdateErrorCode.UPDATE_DOWNGRADE_BLOCKED,
          `Target version ${targetVersion} is not newer than current ${APPLICATION_VERSION}`);
      }

      // ── 7. Prepare temp dir ──────────────────────────────────────────────
      emit('downloading', { targetVersion });
      const dir = updateDir();
      await fs.mkdir(dir, { recursive: true });
      // Clean stale partial artifacts
      await fs.rm(path.join(dir, 'trafficbot-worker.new'), { force: true });

      const destPath = path.join(dir, 'trafficbot-worker.new');
      const downloadUrl = `${ReleaseManager.resolvedBaseUrl || (process.env.TRAFFICBOT_UPDATE_BASE_URL || 'https://github.com/lucasveneno/trafficbot/releases/latest/download')}/${artifact.file}`;

      logger.info(`[update:${updateId}] Downloading ${artifact.file} from ${downloadUrl}`);

      let lastProgressLog = 0;
      const result = await streamDownload(downloadUrl, destPath, artifact.size, (bytes) => {
        const pct = Math.floor((bytes / artifact.size) * 100);
        if (pct - lastProgressLog >= 10) {
          lastProgressLog = pct;
          emit('downloading', { targetVersion, progress: pct });
          logger.info(`[update:${updateId}] Download ${pct}%`);
        }
      });

      // ── 8. Verify size ───────────────────────────────────────────────────
      emit('verifying', { targetVersion });
      if (result.sizeBytes !== artifact.size) {
        await fs.rm(destPath, { force: true });
        throw new UpdateError(UpdateErrorCode.UPDATE_SIZE_MISMATCH,
          `Size mismatch: got ${result.sizeBytes}, expected ${artifact.size}`);
      }

      // ── 9. Verify SHA-256 ────────────────────────────────────────────────
      const actualHex = result.sha256.toLowerCase();
      const expectedHex = artifact.sha256.toLowerCase();
      if (actualHex !== expectedHex) {
        await fs.rm(destPath, { force: true });
        throw new UpdateError(UpdateErrorCode.UPDATE_CHECKSUM_MISMATCH,
          `SHA-256 mismatch: got ${actualHex}, expected ${expectedHex}`);
      }
      logger.info(`[update:${updateId}] Artifact verified ✓ sha256=${actualHex}`);

      // ── 10. Prepare rollback & replace ──────────────────────────────────
      emit('preparing', { targetVersion });
      const currentBin = process.execPath;
      const rollbackMeta = await AtomicReplacer.replace(currentBin, destPath);
      rollbackMeta.version = APPLICATION_VERSION;
      rollbackMeta.protocolVersion = PROTOCOL_VERSION;
      // Write the rollback meta (AtomicReplacer already wrote the file, refresh with correct version)
      await fs.writeFile(currentBin + '.previous.json', JSON.stringify(rollbackMeta, null, 2));

      // Write pending update marker so the new process can verify and then clear it
      await fs.writeFile(pendingMarkerPath(), JSON.stringify({
        expectedVersion: targetVersion,
        expectedProtocolVersion: meta.protocolVersion,
        updateId,
        previousBinary: currentBin + '.previous',
        startedAt: new Date().toISOString(),
      }, null, 2));

      // ── 11. Install & restart ────────────────────────────────────────────
      await emit('installing', { targetVersion });
      logger.info(`[update:${updateId}] Binary replaced. Initiating restart...`);
      await emit('restarting', { targetVersion });

      if (releaseLock) {
        await releaseLock().catch(() => {});
        releaseLock = null;
      }

      await this.beforeRestartHook?.().catch(() => {});
      await restartProcess(workerId, currentBin);

    } catch (e) {
      const errorCode = e instanceof UpdateError ? e.code : 'UNKNOWN';
      const message = e instanceof Error ? e.message : String(e);
      logger.error(`[update:${updateId}] Update failed: ${errorCode} — ${message}`);
      emit('failed', { errorCode });

      // Resume worker so it continues serving jobs
      try {
        await QueueService.resumeWorker(workerId);
        const caps = WorkerRegistry.getCurrentCapabilities(workerId);
        if (caps) { caps.status = 'online'; await WorkerRegistry.registerWorker(caps); }
      } catch { /* best effort */ }

      if (!(e instanceof UpdateError)) throw e;
    } finally {
      if (releaseLock) await releaseLock().catch(() => {});
    }
  }

  // ── rollback ────────────────────────────────────────────────────────────

  static async executeRollback(workerId: string): Promise<void> {
    const updateId = randomUUID();
    let releaseLock: (() => Promise<void>) | null = null;

    try {
      if (!isCompiledBinary()) {
        throw new UpdateError(UpdateErrorCode.ROLLBACK_UNAVAILABLE, 'Rollback unavailable in dev mode');
      }

      releaseLock = await acquireLock();
      this.currentState = 'rolling_back';
      logger.info(`[rollback:${updateId}] Starting rollback for worker ${workerId}`);

      await QueueService.pauseWorker(workerId);
      const caps = WorkerRegistry.getCurrentCapabilities(workerId);
      if (caps) { caps.status = 'draining'; await WorkerRegistry.registerWorker(caps); }
      await waitForDrain(workerId);

      const currentBin = process.execPath;
      if (!await AtomicReplacer.rollbackAvailable(currentBin)) {
        throw new UpdateError(UpdateErrorCode.ROLLBACK_UNAVAILABLE, 'No rollback binary available');
      }

      logger.info(`[rollback:${updateId}] Restoring previous binary`);
      await AtomicReplacer.rollback(currentBin);

      logger.info(`[rollback:${updateId}] Rollback complete. Restarting...`);
      if (releaseLock) {
        await releaseLock().catch(() => {});
        releaseLock = null;
      }
      await this.beforeRestartHook?.().catch(() => {});
      await restartProcess(workerId, currentBin);

    } catch (e) {
      this.currentState = 'failed';
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`[rollback:${updateId}] Rollback failed: ${msg}`);
      try {
        await QueueService.resumeWorker(workerId);
        const caps = WorkerRegistry.getCurrentCapabilities(workerId);
        if (caps) { caps.status = 'online'; await WorkerRegistry.registerWorker(caps); }
      } catch { /* best effort */ }
      throw e;
    } finally {
      if (releaseLock) await releaseLock().catch(() => {});
    }
  }

  /** Check on startup if a pending update marker exists; clear it on healthy init. */
  static async checkPendingUpdateMarker(): Promise<void> {
    const markerPath = pendingMarkerPath();
    try {
      const raw = await fs.readFile(markerPath, 'utf8');
      const marker = JSON.parse(raw);
      
      const versionMatch = marker.expectedVersion === APPLICATION_VERSION;
      const protocolMatch = marker.expectedProtocolVersion === undefined || marker.expectedProtocolVersion === PROTOCOL_VERSION;
      
      if (versionMatch && protocolMatch) {
        logger.info(`[update] Post-update boot confirmed: running ${APPLICATION_VERSION} (protocol ${PROTOCOL_VERSION})`);
        await fs.rm(markerPath, { force: true });
      } else {
        logger.error(`[update] Post-update version mismatch: expected ${marker.expectedVersion} (protocol ${marker.expectedProtocolVersion}), got ${APPLICATION_VERSION} (protocol ${PROTOCOL_VERSION})`);
        // We emit an event. We don't have workerId easily here unless we parse config, but this is a process-level check.
        // Actually we don't know the workerId yet. We can just keep the marker so it's not blindly cleared.
      }
    } catch {
      // No marker or invalid JSON — normal startup
    }
    // Always report rollback availability on startup via heartbeat
    await this.refreshRollbackCapability();
  }

  /** Compute rollback availability and push to worker heartbeat. */
  static async refreshRollbackCapability(): Promise<void> {
    if (!isCompiledBinary()) return;
    const currentBin = process.execPath;
    const available = await AtomicReplacer.rollbackAvailable(currentBin);
    const meta = available ? await AtomicReplacer.loadRollbackMeta(currentBin) : null;
    // Verify previous binary hash if metadata exists
    let verified = false;
    if (available && meta?.sha256) {
      try {
        const actual = await computeFileSha256(currentBin + '.previous');
        verified = actual.toLowerCase() === meta.sha256.toLowerCase();
        if (!verified) logger.warn('[rollback] Previous binary hash mismatch — rollback disabled');
      } catch { verified = false; }
    } else if (available && !meta?.sha256) {
      verified = true; // No metadata — file exists, treat as available
    }
    // Update all registered capabilities with rollback state
    const caps = WorkerRegistry.getCurrentCapabilities();
    if (caps) {
      (caps as any).rollbackAvailable = available && verified;
      (caps as any).rollbackVersion = (available && verified) ? (meta?.version ?? null) : null;
      await WorkerRegistry.registerWorker(caps);
    }
  }

  /** Expose whether rollback is available (for Desktop UI). */
  static async isRollbackAvailable(): Promise<boolean> {
    if (!isCompiledBinary()) return false;
    return AtomicReplacer.rollbackAvailable(process.execPath);
  }
}

// ── private helpers ──────────────────────────────────────────────────────────

/**
 * Re-exec the current binary using saved worker config.
 * Preserves workerId via the saved ~/.trafficbot-worker/config.json.
 * Does NOT forward process.argv to avoid carrying dangerous/stale flags.
 */
async function restartProcess(_workerId: string, binaryPath = process.execPath): Promise<never> {
  const args: string[] = [];

  // Load persisted enrollment config if available
  const configPath = path.join(workerConfigDir(), 'config.json');
  try {
    await fs.access(configPath);
    args.push('--config', configPath);
  } catch { /* no config file, use defaults */ }

  const child = spawn(binaryPath, args, {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
    env: { ...process.env },
    windowsHide: true,
  });
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', () => resolve());
    child.once('error', reject);
  });
  child.unref();
  await new Promise(r => setTimeout(r, 50));
  process.exit(0);
}

/**
 * Minimal semver "is newer" check — compares MAJOR.MINOR.PATCH numerically.
 * Treats pre-release suffixes conservatively (suffix = not newer).
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(s => parseInt(s, 10));
  const [cMaj, cMin, cPat] = parse(candidate);
  const [rMaj, rMin, rPat] = parse(current);
  if (isNaN(cMaj) || isNaN(rMaj)) return false;
  if (cMaj !== rMaj) return cMaj > rMaj;
  if (cMin !== rMin) return cMin > rMin;
  return cPat > rPat;
}
