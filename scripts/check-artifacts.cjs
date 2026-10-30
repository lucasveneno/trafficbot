const { execFileSync } = require('node:child_process');
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0');
const forbidden = files.filter(path =>
  /(^|\/)(node_modules|sessions|logs|dist|coverage|\.local)\//.test(path)
  || /(^|\/)\.env($|\.(?!example$))/.test(path)
  || /\.(tsbuildinfo|key|p12|pfx)$/.test(path)
  || /(^|\/)updater(\.pub)?$/.test(path)
  || /^trafficbot-worker(?:[.-]|$)/.test(path)
  || /(^|\/)test-puppeteer-dir[^/]*\//.test(path)
  || /_HEAD\.ts$/.test(path)
  || /^apps\/desktop\/src-tauri\/(target|gen)\//.test(path)
  || /^apps\/desktop\/src-tauri\/engine\/(?!\.gitkeep$)/.test(path));
if (forbidden.length || !files.includes('package-lock.json')) {
  console.error(`Generated/sensitive paths tracked: ${forbidden.length}; lockfile tracked: ${files.includes('package-lock.json')}`);
  process.exit(1);
}
