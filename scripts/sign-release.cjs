const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const manifestPath = process.argv[2] || path.join(root, 'dist/workers/manifest.json');
const privateKeyStr = process.env.RELEASE_PRIVATE_KEY;

if (!fs.existsSync(manifestPath)) {
  console.error('manifest.json not found');
  process.exit(1);
}

if (!privateKeyStr) {
  if (process.env.ENFORCE_PRODUCTION_SIGNING === '1' || process.env.ENFORCE_PRODUCTION_SIGNING === 'true') {
    console.error('RELEASE_PRIVATE_KEY not set. Cannot sign production release.');
    process.exit(1);
  }
  console.warn('RELEASE_PRIVATE_KEY not set. Skipping signing (dry run behavior).');
  // For local tests we can generate a temporary pair
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  console.warn('Using ephemeral key pair for local test.');
  console.warn('PUBLIC KEY:');
  console.warn(publicKey);
  
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  const sign = crypto.createSign('SHA256');
  sign.update(manifest);
  sign.end();
  const signature = sign.sign(privateKey, 'base64');
  
  fs.writeFileSync(manifestPath + '.sig', signature);
  console.log('Manifest signed successfully (ephemeral).');
  process.exit(0);
}

try {
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  const sign = crypto.createSign('SHA256');
  sign.update(manifest);
  sign.end();
  const signature = sign.sign(privateKeyStr, 'base64');
  
  fs.writeFileSync(manifestPath + '.sig', signature);
  console.log('Manifest signed successfully with PRODUCTION key.');
} catch (e) {
  console.error('Failed to sign manifest:', e);
  process.exit(1);
}
