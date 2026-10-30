const fs = require('fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = process.argv[2] || path.join(__dirname, '../dist/workers');
const manifestPath = path.join(root, 'manifest.json');
const sigPath = path.join(root, 'manifest.json.sig');

if (!fs.existsSync(manifestPath)) {
  console.error('manifest.json missing');
  process.exit(1);
}

if (!fs.existsSync(sigPath)) {
  console.error('manifest.json.sig missing');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const sigStr = fs.readFileSync(sigPath, 'utf8').trim();
const pubKey = process.env.RELEASE_PUBLIC_KEY;

if (pubKey) {
  const verify = crypto.createVerify('SHA256');
  verify.update(fs.readFileSync(manifestPath, 'utf8'));
  verify.end();
  if (!verify.verify(pubKey, sigStr, 'base64')) {
    console.error('Signature invalid');
    process.exit(1);
  }
} else {
  console.warn('Skipping signature validation (RELEASE_PUBLIC_KEY not set)');
}

const artifacts = manifest.artifacts || manifest.assets || {};
for (const [, asset] of Object.entries(artifacts)) {
  const assetPath = path.join(root, asset.file);
  if (!fs.existsSync(assetPath)) {
    console.error(`Asset missing: ${asset.file}`);
    process.exit(1);
  }
  const stat = fs.statSync(assetPath);
  if (stat.size !== asset.size) {
    console.error(`Size mismatch for ${asset.file}: expected ${asset.size}, got ${stat.size}`);
    process.exit(1);
  }
  const actualSha = crypto.createHash('sha256').update(fs.readFileSync(assetPath)).digest('hex');
  if (actualSha !== asset.sha256) {
    console.error(`SHA256 mismatch for ${asset.file}: expected ${asset.sha256}, got ${actualSha}`);
    process.exit(1);
  }
  console.log(`Verified ${asset.file}`);
}
console.log('All assets verified.');
