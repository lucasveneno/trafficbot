const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'dist/workers');
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  { platform: 'linux', arch: 'x64', target: 'bun-linux-x64', ext: '' },
  { platform: 'linux', arch: 'arm64', target: 'bun-linux-arm64', ext: '' },
  { platform: 'windows', arch: 'x64', target: 'bun-windows-x64', ext: '.exe' },
  { platform: 'macos', arch: 'x64', target: 'bun-darwin-x64', ext: '' },
  { platform: 'macos', arch: 'arm64', target: 'bun-darwin-arm64', ext: '' }
];

const manifest = {
  version: require('../package.json').version,
  protocolVersion: 1, // Keep synchronized with Protocol.ts PROTOCOL_VERSION
  releasedAt: new Date().toISOString(),
  artifacts: {}
};

for (const t of targets) {
  const binName = `trafficbot-worker-${t.platform}-${t.arch}${t.ext}`;
  const outFile = path.join(outDir, binName);
  
  console.log(`Compiling worker for ${t.target}...`);
  const res = spawnSync('bun', ['build', '--compile', `--target=${t.target}`, './src/main.ts', '--outfile', outFile], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  
  if (res.status !== 0) {
    console.error(`Failed to compile ${binName}`);
    process.exit(1);
  }
  
  const buffer = fs.readFileSync(outFile);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  manifest.artifacts[t.platform + '-' + t.arch] = { file: binName, sha256: hash, size: buffer.length, platform: t.platform, arch: t.arch };
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Worker compilation complete. Manifest generated.');
