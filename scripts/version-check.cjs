const fs = require('fs')

const root = require('../package.json').version
const desktop = require('../apps/desktop/package.json').version
const tauri = require('../apps/desktop/src-tauri/tauri.conf.json').version
let cargo = fs.readFileSync('apps/desktop/src-tauri/Cargo.toml', 'utf8').match(/version = "(.*?)"/)?.[1]
if (!cargo) throw new Error('Could not parse Cargo.toml version')

const versions = { root, desktop, tauri, cargo }
const unique = new Set(Object.values(versions))

if (unique.size !== 1) {
  console.error('Version mismatch detected:', versions)
  process.exit(1)
}
console.log(`Version check passed: ${root}`)
