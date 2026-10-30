const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const { mkdtemp, readFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { WebSocket } = require('ws');
const Redis = require('ioredis');
const { Queue } = require('bullmq');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, label, timeout = 15000) { const end = Date.now() + timeout; while (Date.now() < end) { try { const value = await test(); if (value) return value; } catch {} await pause(100); } throw new Error(`Timed out: ${label}`); }
async function port() { const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const value = server.address().port; await new Promise(resolve => server.close(resolve)); return value; }
async function main() {
  if (!process.env.REDIS_TEST_URL) throw new Error('Set REDIS_TEST_URL to an empty dedicated test Redis database');
  const redis = new Redis(process.env.REDIS_TEST_URL, { maxRetriesPerRequest: 1 });
  await until(() => redis.status === 'ready', 'Redis readiness');
  if ((await redis.dbsize()) !== 0) { redis.disconnect(); throw new Error('Test database must be empty'); }
  const directory = await mkdtemp(join(tmpdir(), 'trafficbot-desktop-integration-'));
  let requests = 0, ws, proxied = 0;
  const paths = new Set();
  const fixture = createServer((req, res) => { requests++; paths.add(req.url); res.end('<html><body>Desktop integration fixture</body></html>'); });
  const proxy = createServer((req, res) => {
    if (req.headers['proxy-authorization'] !== 'Basic ' + Buffer.from('pool-user:pool-secret').toString('base64')) { res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="fixture"' }); res.end(); return; }
    if (req.url.includes('campaign.fixture.test')) proxied++;
    res.end('<html><body>Controlled proxy fixture</body></html>');
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const target = `http://127.0.0.1:${fixture.address().port}/`;
  const apiPort = await port(), healthPort = await port();
  const env = { ...process.env, REDIS_URL: process.env.REDIS_TEST_URL, TRAFFICBOT_CONTROL_DIR: directory, CONTROL_PORT: String(apiPort), CONTROL_API_ENABLED: 'false', BOT_ROLE: 'worker', WORKER_PLATFORM: 'auto', HEALTH_PORT: String(healthPort), LOG_LEVEL: 'error', HEADLESS: 'true', URL: '', DEFAULT_URL: target, PROXY_URL: '', PROXY_PORT: '', PROXY_USER: '', PROXY_PASS: '', PROXY_LOCATION_URL: '', MATCH_GEOLOCATION: 'false', GRANT_GEOLOCATION: 'false', EXTERNAL_IP_CHECK: 'false', HUMAN_BEHAVIOR: 'false', ORGANIC_SEARCH: 'false', PERSISTENT_SESSIONS: 'false', MAX_SESSIONS: '1' };
  const children = [];
  env.SESSIONS_DATA_DIR = join(directory, 'controller-sessions');
  env.MAX_SESSIONS = '2';
  env.ENCRYPTION_KEY = 'local-integration-fixture-key-123';
  function start(file) { const childEnv = file === 'dist/main.js' ? { ...env, SESSIONS_DATA_DIR: join(directory, 'worker-sessions') } : env; const child = spawn(process.execPath, [file], { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] }); child.on('error', error => { child.spawnFailure = error; }); let output = ''; child.stdout.on('data', b => { output = (output + b).slice(-8000); }); child.stderr.on('data', b => { output = (output + b).slice(-8000); }); child.output = () => output; child.done = new Promise(resolve => child.once('exit', resolve)); children.push(child); return child; }
  const controller = process.env.CONTROLLER_BINARY ? (() => {
    const child = spawn(process.env.CONTROLLER_BINARY, [], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', b => { output = (output + b).slice(-8000) }); child.stderr.on('data', b => { output = (output + b).slice(-8000) });
    child.output = () => output; child.done = new Promise(resolve => child.once('exit', resolve)); children.push(child); return child;
  })() : start('dist/controller.js');
  try {
    const token = await until(async () => (await readFile(join(directory, 'control-token'), 'utf8')).trim(), 'controller token').catch(error => { throw new Error(`${error.message}: ${controller.output()}`) });
    const base = `http://127.0.0.1:${apiPort}`;
    const call = (route, method = 'GET', body) => fetch(base + route, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body), signal: AbortSignal.timeout(3000) });
    await until(async () => (await (await call('/api/system')).json()).redis === 'ready', 'controller health');
    assert.deepEqual(await (await call('/api/sessions')).json(), [], 'starting controller must not enqueue work');
    const events = [];
    ws = new WebSocket(base.replace('http:', 'ws:') + '/events', ['trafficbot', token]);
    ws.on('message', raw => events.push(JSON.parse(raw.toString()))); ws.on('error', () => {});
    await until(() => events.some(e => e.type === 'snapshot'), 'event connection');
    const worker = start('dist/main.js');
    const workers = await until(async () => { const value = await (await call('/api/workers')).json(); return value.length ? value : false; }, 'worker registration');
    assert.equal((await call('/api/sessions', 'POST', { url: target, durationMinutes: 0.05, intensity: 'low', persistent: false, requirements: { platform: workers[0].platform, browser: 'chrome' } })).status, 202);
    await until(() => events.some(e => e.type === 'session.started'), 'live session started');
    assert.equal((await call('/api/engine/shutdown', 'POST')).status, 409, 'active work must block shutdown');
    await until(() => events.some(e => e.type === 'session.finished'), 'live session finished', 30000);
    const completed = (await (await call('/api/sessions')).json()).find(s => s.status === 'completed');
    assert.equal(completed.workerId, workers[0].id); assert.equal(completed.url, target); assert.ok(requests > 0);
    // A user stop must cancel the browser and suppress automatic retry.
    assert.equal((await call('/api/sessions', 'POST', { url: target, durationMinutes: 10, intensity: 'low', persistent: false, requirements: { platform: workers[0].platform, browser: 'chrome' } })).status, 202);
    const running = await until(async () => (await (await call('/api/sessions')).json()).find(s => s.status === 'active'), 'cancellable session');
    assert.equal((await call(`/api/sessions/${running.id}/stop`, 'POST')).status, 202);
    await until(async () => (await (await call('/api/sessions')).json()).find(s => s.id === running.id && s.status === 'failed' && s.attempts === 1), 'single-attempt cancellation', 15000);
    assert.equal((await call(`/api/sessions/${running.id}/retry`, 'POST')).status, 202);
    const retried = await until(async () => (await (await call('/api/sessions')).json()).find(s => s.id === running.id && s.status === 'active'), 'manual retry');
    assert.equal((await call(`/api/sessions/${retried.id}/stop`, 'POST')).status, 202);
    await until(async () => (await (await call('/api/system')).json()).counts.active === 0, 'retry cancellation');
    const campaignConfig = { name: 'Local multi-target campaign', url: target + 'one', targets: [target + 'one', target + 'two'], concurrency: 2, totalSessions: 4, durationMinutes: 0.05, intensity: 'low', behaviorModel: 'generic', persistent: false, proxyMode: 'direct', requirements: { platform: workers[0].platform, browser: 'chrome' }, schedule: { mode: 'immediate' } };
    const created = await call('/api/campaigns', 'POST', campaignConfig); assert.equal(created.status, 201); const campaign = await created.json();
    assert.equal((await call(`/api/campaigns/${campaign.id}/status`, 'PATCH', { status: 'active' })).status, 200);
    await until(async () => (await (await call('/api/sessions')).json()).some(s => s.campaignId === campaign.id && s.status === 'active'), 'campaign started');
    assert.equal((await call(`/api/campaigns/${campaign.id}/status`, 'PATCH', { status: 'paused' })).status, 200);
    const beforePause = (await (await call('/api/sessions')).json()).filter(s => s.campaignId === campaign.id).length;
    await pause(3500);
    assert.equal((await (await call('/api/sessions')).json()).filter(s => s.campaignId === campaign.id).length, beforePause, 'paused campaign must not dispatch more targets');
    assert.equal((await call(`/api/campaigns/${campaign.id}/status`, 'PATCH', { status: 'active' })).status, 200);
    await until(async () => (await (await call(`/api/campaigns/${campaign.id}`)).json()).status === 'completed', 'campaign completion', 45000);
    const campaignSessions = (await (await call('/api/sessions')).json()).filter(s => s.campaignId === campaign.id);
    assert.equal(campaignSessions.length, 4); assert.ok(campaignSessions.every(s => s.status === 'completed')); assert.ok(paths.has('/one') && paths.has('/two'));
    const totals = (await (await call(`/api/campaigns/${campaign.id}`)).json()).stats;
    assert.equal(totals.totalQueued, 4); assert.equal(totals.totalCompleted, 4);
    const addedProxy = await call('/api/proxies', 'POST', { protocol: 'http', host: '127.0.0.1', port: proxy.address().port, username: 'pool-user', password: 'pool-secret', maxConcurrentLeases: 1 });
    assert.equal(addedProxy.status, 200); const selectedProxy = await addedProxy.json();
    const poolConfig = { ...campaignConfig, name: 'Selected proxy campaign', url: 'http://campaign.fixture.test/pool', targets: ['http://campaign.fixture.test/pool'], totalSessions: 2, concurrency: 2, durationMinutes: 0.01, proxyMode: 'pool', proxyIds: [selectedProxy.id] };
    const poolResponse = await call('/api/campaigns', 'POST', poolConfig); assert.equal(poolResponse.status, 201); const pooled = await poolResponse.json();
    assert.equal((await call(`/api/campaigns/${pooled.id}/status`, 'PATCH', { status: 'active' })).status, 200);
    await until(async () => (await (await call(`/api/campaigns/${pooled.id}`)).json()).status === 'completed', 'selected proxy campaign', 30000);
    assert.ok(proxied > 0, 'selected authenticated proxy must be used');
    const poolSessions = (await (await call('/api/sessions')).json()).filter(s => s.campaignId === pooled.id);
    assert.equal(poolSessions.length, 2); assert.ok(poolSessions.every(s => s.status === 'completed' && s.attempts === 1), 'proxy capacity waits must not consume execution attempts');
    assert.ok(!(JSON.stringify(await (await call('/api/sessions')).json())).includes('pool-secret'));
    worker.kill('SIGTERM'); await worker.done;
    assert.equal(worker.exitCode, 0, worker.output());
    assert.equal((await call('/api/engine/shutdown', 'POST')).status, 202);
    await until(() => controller.exitCode !== null, 'controller graceful exit').catch(error => { throw new Error(`${error.message}: ${controller.output()}`) }); assert.equal(controller.exitCode, 0, controller.output());
    console.log('PASS: controller startup, authenticated API, real browser Stop/Retry, multi-target campaign pause/resume/completion, selected proxy authentication with separate worker storage, campaign totals, and graceful exits.');
  } finally {
    ws?.terminate();
    for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
    await Promise.race([Promise.all(children.map(c => c.done)), pause(10000)]);
    fixture.closeAllConnections(); await new Promise(resolve => fixture.close(resolve));
    proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve));
    for (const platform of ['linux', 'windows', 'macos', 'android']) { const queue = new Queue(`traffic-sessions-${platform}`, { connection: redis }); await queue.obliterate({ force: true }); await queue.close(); }
    redis.disconnect();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
