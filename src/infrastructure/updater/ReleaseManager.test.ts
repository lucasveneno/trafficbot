import { ReleaseManager } from './ReleaseManager';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'node:crypto';

describe('ReleaseManager', () => {
  beforeAll(async () => {
    // Generate a temporary keypair for testing
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    
    // @ts-ignore
    ReleaseManager.PUBLIC_KEY = publicKey;

    const root = path.resolve(__dirname, '../../..');
    const outDir = path.join(root, 'dist/workers');
    await fs.mkdir(outDir, { recursive: true });
    
    const manifestStr = JSON.stringify({
      version: '2.5.0',
      protocolVersion: 1,
      releasedAt: '2026-09-27T00:00:00.000Z',
      artifacts: {
        'linux-x64': {
          file: 'trafficbot-worker-linux-x64',
          sha256: 'deadbeef',
          size: 100,
          platform: 'linux',
          arch: 'x64'
        }
      }
    });
    
    await fs.writeFile(path.join(outDir, 'manifest.json'), manifestStr);
    
    const sign = crypto.createSign('SHA256');
    sign.update(manifestStr);
    sign.end();
    const signature = sign.sign(privateKey, 'base64');
    
    await fs.writeFile(path.join(outDir, 'manifest.json.sig'), signature);
  });

  test('validates manifest successfully', async () => {
    await ReleaseManager.refresh();
    const meta = ReleaseManager.getMetadata('2.0.0');
    expect(meta).not.toBeNull();
    expect(meta?.latestVersion).toBe('2.5.0');
    expect(meta?.signatureStatus).toBe('valid');
  });

  test('invalidates bad signature', async () => {
    const root = path.resolve(__dirname, '../../..');
    const outDir = path.join(root, 'dist/workers');
    await fs.writeFile(path.join(outDir, 'manifest.json.sig'), 'bad-signature-data');
    
    await ReleaseManager.refresh();
    const meta = ReleaseManager.getMetadata('2.0.0');
    expect(meta?.signatureStatus).toBe('invalid');
  });
});
