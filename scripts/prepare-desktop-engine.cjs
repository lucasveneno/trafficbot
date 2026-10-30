const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'apps/desktop/src-tauri/engine');
fs.mkdirSync(destination, { recursive: true });

const target = `bun-${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
const binExt = process.platform === 'win32' ? '.exe' : '';
const binName = `trafficbot-sidecar${binExt}`;

console.log(`Compiling standalone Control Server for ${target}...`);
const relOutFile = path.relative(root, path.join(destination, binName));
const result = spawnSync('bun', ['build', '--compile', `--target=${target}`, './src/controller.ts', '--outfile', relOutFile], { cwd: root, stdio: 'inherit' });

if (result.status !== 0) process.exit(result.status || 1);
if (process.platform === 'darwin') {
  const signed = spawnSync('codesign', ['--force', '--sign', '-', path.join(destination, binName)], { stdio: 'inherit' });
  if (signed.status !== 0) process.exit(signed.status || 1);
}
console.log(`Successfully compiled standalone Control Server at ${destination}/${binName}`);
