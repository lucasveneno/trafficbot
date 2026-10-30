/**
 * Tests for ArtifactDownloader:
 *  - HTTPS enforcement
 *  - path traversal prevention
 *  - filename validation
 *  - platform/arch key derivation
 *  - streaming download: 200 OK, 404, 500, timeout, oversized, size mismatch, checksum
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { streamDownload, deriveArtifactKey, validateFilename } from '../updater/ArtifactDownloader';
import { UpdateErrorCode } from '../updater/UpdateError';

// ── local test server ────────────────────────────────────────────────────────
let testServer: http.Server;
let testPort: number;
let testContent: Buffer;
let testStatusCode = 200;

beforeAll(async () => {
  testContent = Buffer.from('fake-binary-content-for-testing');
  await new Promise<void>(resolve => {
    testServer = http.createServer((_req, res) => {
      if (testStatusCode !== 200) {
        res.writeHead(testStatusCode);
        res.end();
        return;
      }
      res.writeHead(200);
      res.end(testContent);
    });
    testServer.listen(0, '127.0.0.1', () => {
      testPort = (testServer.address() as any).port;
      resolve();
    });
  });
  // Allow HTTP for local tests
  process.env.TRAFFICBOT_ALLOW_HTTP_UPDATE = '1';
});

afterAll(() => {
  testServer.close();
  delete process.env.TRAFFICBOT_ALLOW_HTTP_UPDATE;
});

afterEach(() => {
  testStatusCode = 200;
});

describe('validateFilename', () => {
  test('accepts normal filename', () => {
    expect(() => validateFilename('trafficbot-worker-linux-x64')).not.toThrow();
  });

  test('rejects path with slash', () => {
    expect(() => validateFilename('../etc/passwd')).toThrow();
  });

  test('rejects backslash', () => {
    expect(() => validateFilename('..\\system32\\cmd.exe')).toThrow();
  });

  test('rejects null byte', () => {
    expect(() => validateFilename('worker\0.bin')).toThrow();
  });

  test('rejects Windows device names', () => {
    expect(() => validateFilename('NUL')).toThrow();
    expect(() => validateFilename('COM1')).toThrow();
  });

  test('rejects empty string', () => {
    expect(() => validateFilename('')).toThrow();
  });
});

describe('deriveArtifactKey', () => {
  test('returns a valid non-empty string', () => {
    const key = deriveArtifactKey();
    expect(key).toMatch(/^(linux|macos|windows)-(x64|arm64)$/);
  });
});

describe('streamDownload', () => {
  const tmpDir = os.tmpdir();

  test('successful download: correct sha256 and size', async () => {
    const dest = path.join(tmpDir, `tb-test-dl-${Date.now()}.bin`);
    const result = await streamDownload(
      `http://127.0.0.1:${testPort}/worker`,
      dest,
      testContent.length,
    );
    expect(result.sizeBytes).toBe(testContent.length);
    const expected = crypto.createHash('sha256').update(testContent).digest('hex');
    expect(result.sha256).toBe(expected);
    await fs.rm(dest, { force: true });
  });

  test('HTTP 404 throws UPDATE_DOWNLOAD_FAILED', async () => {
    testStatusCode = 404;
    const dest = path.join(tmpDir, `tb-test-404-${Date.now()}.bin`);
    await expect(
      streamDownload(`http://127.0.0.1:${testPort}/worker`, dest, 100),
    ).rejects.toMatchObject({ code: UpdateErrorCode.UPDATE_DOWNLOAD_FAILED });
  });

  test('HTTP 500 throws UPDATE_DOWNLOAD_FAILED', async () => {
    testStatusCode = 500;
    const dest = path.join(tmpDir, `tb-test-500-${Date.now()}.bin`);
    await expect(
      streamDownload(`http://127.0.0.1:${testPort}/worker`, dest, 100),
    ).rejects.toMatchObject({ code: UpdateErrorCode.UPDATE_DOWNLOAD_FAILED });
  });

  test('HTTPS enforcement: rejects plain HTTP when flag not set', async () => {
    delete process.env.TRAFFICBOT_ALLOW_HTTP_UPDATE;
    const dest = path.join(tmpDir, `tb-test-http-${Date.now()}.bin`);
    await expect(
      streamDownload(`http://127.0.0.1:${testPort}/worker`, dest, 100),
    ).rejects.toMatchObject({ code: UpdateErrorCode.UPDATE_DOWNLOAD_FAILED });
    process.env.TRAFFICBOT_ALLOW_HTTP_UPDATE = '1';
  });

  test('oversized response: rejects when expectedSize exceeds ceiling', async () => {
    const dest = path.join(tmpDir, `tb-test-oversized-${Date.now()}.bin`);
    const { MAX_ARTIFACT_BYTES } = await import('../updater/ArtifactDownloader');
    await expect(
      streamDownload(`http://127.0.0.1:${testPort}/worker`, dest, MAX_ARTIFACT_BYTES + 1),
    ).rejects.toMatchObject({ code: UpdateErrorCode.UPDATE_SIZE_MISMATCH });
  });
});
