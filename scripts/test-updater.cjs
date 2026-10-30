const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createServer } = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const Redis = require('ioredis');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = await check(); if (result) return result; await pause(250); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  if (!process.env.REDIS_TEST_URL) throw new Error('Set REDIS_TEST_URL to an empty disposable Redis database');
  const root = path.resolve(__dirname, '..');
  const platform = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
  const ext = process.platform === 'win32' ? '.exe' : '';
  const artifactKey = `${platform}-${process.arch}`;
  const redis = new Redis(process.env.REDIS_TEST_URL, { maxRetriesPerRequest: 1, connectTimeout: 2000, retryStrategy: () => null });
  redis.on('error', () => {});
  await redis.ping();
  if (await redis.dbsize()) { redis.disconnect(); throw new Error('Updater test database must be empty'); }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'Trafficbot Update Test '));
  const running = path.join(directory, `worker-current${ext}`), next = path.join(directory, `worker-next${ext}`);
  const pids = new Set(); let child, server, output = '';
  async function workers() {
    const values = await Promise.all((await redis.keys('traffic:workers:*')).map(key => redis.get(key)));
    return values.filter(Boolean).map(value => JSON.parse(value));
  }
  function remember(worker) {
    const pid = Number(worker.workerId.slice(worker.workerId.lastIndexOf('-') + 1));
    assert.ok(worker.workerId.startsWith(os.hostname() + '-') && Number.isInteger(pid) && pid > 0);
    pids.add(pid); return worker;
  }
  async function ready(version, exclude) {
    return remember(await until(async () => {
      const worker = (await workers()).find(value => value.version === version && value.workerId !== exclude);
      if (!worker) return false;
      const subscribers = await redis.pubsub('NUMSUB', `traffic:worker:${worker.workerId}:commands`);
      return Number(subscribers[1]) > 0 ? worker : false;
    }, `worker ${version}`));
  }
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    const versionA = pkg.version;
    const parts = versionA.split('.').map(Number); assert.ok(parts.every(Number.isInteger));
    const versionB = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    await fs.copyFile(path.join(root, 'dist/workers', `trafficbot-worker-${artifactKey}${ext}`), running);
    await fs.chmod(running, 0o755);
    // Compile genuinely different versions. Renaming the same binary cannot prove an update succeeded.
    const source = path.join(directory, 'source'); await fs.mkdir(source);
    await fs.cp(path.join(root, 'src'), path.join(source, 'src'), { recursive: true });
    await fs.writeFile(path.join(source, 'package.json'), JSON.stringify({ ...pkg, version: versionB }));
    await fs.symlink(path.join(root, 'node_modules'), path.join(source, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    const compiled = spawnSync('bun', ['build', '--compile', './src/main.ts', '--outfile', next], { cwd: source, stdio: 'inherit', timeout: 120000, shell: process.platform === 'win32' });
    assert.equal(compiled.status, 0, 'compile next-version fixture');
    if (process.platform === 'darwin') {
      assert.equal(spawnSync('codesign', ['--force', '--sign', '-', running]).status, 0);
      assert.equal(spawnSync('codesign', ['--force', '--sign', '-', next]).status, 0);
    }
    const bytes = await fs.readFile(next);
    const manifest = JSON.stringify({ version: versionB, protocolVersion: 1, releasedAt: new Date().toISOString(), artifacts: { [artifactKey]: { file: path.basename(next), size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), platform, arch: process.arch } } });
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1', publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    const signature = crypto.sign('SHA256', Buffer.from(manifest), privateKey).toString('base64');
    server = createServer((req, res) => {
      if (req.url === '/manifest.json') res.end(manifest);
      else if (req.url === '/manifest.json.sig') res.end(signature);
      else if (req.url === '/' + path.basename(next)) createReadStream(next).pipe(res);
      else { res.writeHead(404); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const probe = createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const healthPort = probe.address().port; await new Promise(resolve => probe.close(resolve));
    const env = { ...process.env, BOT_ROLE: 'worker', WORKER_PLATFORM: platform, REDIS_URL: process.env.REDIS_TEST_URL, CONTROL_API_ENABLED: 'false', HEALTH_PORT: String(healthPort), URL: '', DEFAULT_URL: 'http://127.0.0.1/', EXTERNAL_IP_CHECK: 'false', TRAFFICBOT_WORKER_CONFIG_DIR: path.join(directory, 'config'), SESSIONS_DATA_DIR: path.join(directory, 'sessions'), TRAFFICBOT_UPDATE_BASE_URL: `http://127.0.0.1:${server.address().port}`, TRAFFICBOT_ALLOW_HTTP_UPDATE: '1', RELEASE_PUBLIC_KEY: publicKey };
    child = spawn(running, [], { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.on('error', error => { output += error.message; });
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-12000); });
    child.stderr.on('data', chunk => { output = (output + chunk).slice(-12000); });
    pids.add(child.pid);
    const initial = await ready(versionA);
    await redis.publish(`traffic:worker:${initial.workerId}:commands`, JSON.stringify({ type: 'update' }));
    const updated = await ready(versionB, initial.workerId);
    const rollback = JSON.parse(await fs.readFile(running + '.previous.json', 'utf8'));
    assert.equal(rollback.version, versionA);
    await redis.publish(`traffic:worker:${updated.workerId}:commands`, JSON.stringify({ type: 'rollback' }));
    const restored = await ready(versionA, initial.workerId);
    assert.notEqual(restored.workerId, updated.workerId);
    console.log(`PASS: signed ${platform} update ${versionA} -> ${versionB} -> rollback ${versionA}`);
  } catch (error) { console.error(output); throw error; }
  finally {
    for (const worker of await workers().catch(() => [])) remember(worker);
    for (const pid of pids) { if (pid) { try { process.kill(pid, 'SIGTERM'); } catch {} } }
    await pause(2000);
    server?.closeAllConnections(); await new Promise(resolve => server ? server.close(resolve) : resolve());
    await redis.flushdb(); redis.disconnect();
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
