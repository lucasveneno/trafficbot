/**
 * AtomicReplacer — OS-aware safe binary replacement and rollback.
 *
 * POSIX (Linux / macOS):
 *   current    → previous   (rename — atomic on same filesystem)
 *   new binary → current    (rename — atomic)
 *   If the second rename fails, previous is moved back immediately.
 *
 * Windows:
 *   Running .exe cannot be overwritten by the same process.
 *   Strategy: write a tiny PowerShell helper script that waits for
 *   the current PID to exit, renames files, then relaunches the worker.
 *   The worker process exits after spawning the helper.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { UpdateError, UpdateErrorCode } from './UpdateError';

export interface RollbackMeta {
  version: string;
  protocolVersion: number;
  sha256: string;
  createdAt: string;
}

export class AtomicReplacer {
  /**
   * Replace currentBin with newBin.
   * Creates a .previous backup of currentBin first.
   * Returns metadata describing the backup.
   */
  static async replace(currentBin: string, newBin: string): Promise<RollbackMeta> {
    const previousBin = currentBin + '.previous';
    const previousMeta = currentBin + '.previous.json';

    // Compute SHA-256 of the current binary for rollback record
    const currentSha256 = await computeFileSha256(currentBin);

    // Remove stale previous (keep only one generation)
    try {
      await fs.rm(previousBin, { force: true });
    } catch {
      const retired = `${previousBin}.retired.${Date.now()}`;
      await fs.rename(previousBin, retired).catch(() => {});
      await fs.rm(retired, { force: true }).catch(() => {});
    }
    await fs.rm(previousMeta, { force: true });

    await this.replacePosix(currentBin, newBin, previousBin);

    const meta: RollbackMeta = {
      version: 'unknown', // Will be filled in by WorkerUpdater
      protocolVersion: 0,
      sha256: currentSha256,
      createdAt: new Date().toISOString(),
    };
    await fs.writeFile(previousMeta, JSON.stringify(meta, null, 2));
    return meta;
  }

  /** Atomic rename swap (works on POSIX and Windows NTFS where running images allow rename). */
  static async replacePosix(currentBin: string, newBin: string, previousBin: string): Promise<void> {
    // Ensure executable bit on POSIX
    if (os.platform() !== 'win32') {
      try { await fs.chmod(newBin, 0o755); } catch {
        throw new UpdateError(UpdateErrorCode.UPDATE_PERMISSION_DENIED, `Cannot chmod ${newBin}`);
      }
    }

    // Move current → previous (atomic rename)
    try { await fs.rename(currentBin, previousBin); } catch (e) {
      throw new UpdateError(UpdateErrorCode.UPDATE_REPLACE_FAILED, `Failed to create backup: ${e}`);
    }

    // Move new → current (atomic rename, or stage copy in target dir if cross-device or scan-locked)
    try {
      await fs.rename(newBin, currentBin);
    } catch {
      const staged = `${currentBin}.new.${Date.now()}`;
      try {
        await fs.copyFile(newBin, staged);
        if (os.platform() !== 'win32') await fs.chmod(staged, 0o755);
        await fs.rename(staged, currentBin);
        await fs.rm(newBin, { force: true }).catch(() => {});
        return;
      } catch (copyErr) {
        await fs.rm(staged, { force: true }).catch(() => {});
        try { await fs.rename(previousBin, currentBin); } catch { /* best effort */ }
        throw new UpdateError(UpdateErrorCode.UPDATE_REPLACE_FAILED, `Binary replacement failed, previous restored: ${copyErr}`);
      }
    }
  }

  /**
   * Windows: spawn a lightweight PowerShell helper that waits for our PID to
   * exit before performing the rename, then restarts the worker.
   * The worker exits cleanly after spawning the helper.
   */
  static async replaceWindows(
    currentBin: string,
    newBin: string,
    previousBin: string,
    workerArgs: string[] = [],
  ): Promise<void> {
    const pid = process.pid;
    // PowerShell single-quoted strings escape single quotes by doubling them.
    const psEscape = (str: string) => str.replace(/'/g, "''");
    const restartArgs = workerArgs.map(a => `'${psEscape(a)}'`).join(', ');
    const scriptPath = path.join(os.tmpdir(), `trafficbot-update-${pid}-${Date.now()}.ps1`);

    // PowerShell script: narrowly scoped — rename with NTFS lock retry, then relaunch
    const script = `
$ErrorActionPreference = 'Stop'
$targetPid = ${pid}
# Wait for the current worker process to exit (max 60 s)
$timeout = [DateTime]::UtcNow.AddSeconds(60)
while ([DateTime]::UtcNow -lt $timeout) {
  if (-not (Get-Process -Id $targetPid -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 250
}
if (Get-Process -Id $targetPid -ErrorAction SilentlyContinue) {
  Write-Error "Worker process did not exit within timeout"
  exit 1
}
# Rename old → previous, new → current (retry briefly while NTFS releases image lock)
$swapped = $false
for ($i = 0; $i -lt 40; $i++) {
  try {
    Move-Item -LiteralPath '${psEscape(currentBin)}' -Destination '${psEscape(previousBin)}' -Force
    Move-Item -LiteralPath '${psEscape(newBin)}' -Destination '${psEscape(currentBin)}' -Force
    $swapped = $true
    break
  } catch {
    if ((Test-Path -LiteralPath '${psEscape(previousBin)}') -and -not (Test-Path -LiteralPath '${psEscape(currentBin)}')) {
      Move-Item -LiteralPath '${psEscape(previousBin)}' -Destination '${psEscape(currentBin)}' -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 250
  }
}
if (-not $swapped) {
  Write-Error "Failed to replace worker binary after process exit"
  exit 1
}
# Restart worker
Start-Process -FilePath '${psEscape(currentBin)}' -WindowStyle Hidden ${restartArgs ? `-ArgumentList ${restartArgs}` : ''}
# Cleanup self
Remove-Item -LiteralPath '${psEscape(scriptPath)}' -Force -ErrorAction SilentlyContinue
`;
    await fs.writeFile(scriptPath, script, 'utf8');

    const child = spawn('powershell.exe', ['-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    // Worker will exit shortly after; the PS script handles the rename + restart
  }

  /** Check whether a valid rollback binary exists. */
  static async rollbackAvailable(currentBin: string): Promise<boolean> {
    const previousBin = currentBin + '.previous';
    try { await fs.access(previousBin); return true; } catch { return false; }
  }

  /** Load rollback metadata if available. */
  static async loadRollbackMeta(currentBin: string): Promise<RollbackMeta | null> {
    const metaPath = currentBin + '.previous.json';
    try {
      return JSON.parse(await fs.readFile(metaPath, 'utf8'));
    } catch { return null; }
  }

  /** Restore the .previous binary in place of the current binary. */
  static async rollback(currentBin: string): Promise<void> {
    const previousBin = currentBin + '.previous';
    try { await fs.access(previousBin); } catch {
      throw new UpdateError(UpdateErrorCode.ROLLBACK_UNAVAILABLE, 'No previous binary found for rollback');
    }

    const meta = await this.loadRollbackMeta(currentBin);
    if (meta?.sha256) {
      const actualSha = await computeFileSha256(previousBin);
      if (actualSha.toLowerCase() !== meta.sha256.toLowerCase()) {
        throw new UpdateError(UpdateErrorCode.ROLLBACK_FAILED, `Rollback verification failed: expected ${meta.sha256}, got ${actualSha}`);
      }
    }

    // Swap current → stale, previous → current (works on POSIX and Windows NTFS)
    const stale = `${currentBin}.rollback_stale.${Date.now()}`;
    await fs.rm(stale, { force: true }).catch(() => {});
    try { await fs.rename(currentBin, stale); } catch { /* current may already be broken */ }
    try {
      try {
        await fs.rename(previousBin, currentBin);
      } catch {
        await fs.copyFile(previousBin, currentBin);
        await fs.rm(previousBin, { force: true }).catch(() => {});
      }
      if (os.platform() !== 'win32') await fs.chmod(currentBin, 0o755);
    } catch (e) {
      // Attempt restore of the broken current
      try { await fs.rename(stale, currentBin); } catch { /* best effort */ }
      throw new UpdateError(UpdateErrorCode.ROLLBACK_FAILED, `Rollback rename failed: ${e}`);
    }
    await fs.rm(stale, { force: true }).catch(() => {});
  }
}

export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = require('node:fs').createReadStream(filePath);
    stream.on('data', (d: Buffer) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
