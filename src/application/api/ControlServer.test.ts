import { WebSocket } from 'ws';
import { get } from 'http';
import { mkdtemp, readFile, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ControlServer } from './ControlServer';
import { ControlSnapshot, ControlEvent } from '../../domain/control/ControlContract';
import { loadControlToken, validOrigin, validToken } from './ControlAuth';
import { publicUrl } from './ControlState';
import { QueueService } from '../../infrastructure/queue/QueueService';
import { EnrollmentService } from '../../infrastructure/worker/EnrollmentService';

test('installation token is persistent, private, and compared safely', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trafficbot-auth-'));
  const first = await loadControlToken(directory);
  expect(first).toMatch(/^[a-f0-9]{64}$/); expect(await loadControlToken(directory)).toBe(first);
  expect(await readFile(join(directory, 'control-token'), 'utf8')).toBe(first);
  if (process.platform !== 'win32') expect((await stat(join(directory, 'control-token'))).mode & 0o777).toBe(0o600);
  expect(validToken(first, first)).toBe(true); expect(validToken('x', first)).toBe(false);
  expect(validOrigin('https://evil.example')).toBe(false); expect(validOrigin('tauri://localhost')).toBe(true);
  expect(publicUrl('https://name:secret@example.com/page?token=secret#secret')).toBe('https://example.com/page');
});

(process.env.RUN_CONTROL_TESTS === '1' ? describe : describe.skip)('loopback Control API', () => {
  let server: ControlServer, url: string, state: ControlSnapshot;
  const token = 'a'.repeat(64), shutdown = jest.fn(async () => undefined), submit = jest.fn(async () => 'session-1');
  const headers = { Authorization: `Bearer ${token}` };
  beforeEach(async () => {
    shutdown.mockClear(); submit.mockClear();
    state = { system: { application: 'trafficbot', apiVersion: 1, status: 'healthy', redis: 'ready', uptimeSeconds: 1, platform: 'darwin', updatedAt: new Date().toISOString(), counts: { active: 0, queued: 0, completedToday: 0, failed: 0, workers: 1, capacity: 2 } }, workers: [{ id: 'mac-1', platform: 'macos', architecture: 'arm64', runtime: 'native', browsers: [{ browser: 'chrome', version: '140' }], capacity: 2, active: 0, heartbeatAt: null, health: 'healthy', status: 'online', version: '2.0.1', protocolVersion: 1, compatibility: 'compatible', rollbackAvailable: false, rollbackVersion: null }], sessions: [], queues: [{ id: 'q1', platform: 'macos', label: 'macOS', waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }] };
    server = new ControlServer({ snapshot: async () => structuredClone(state), submit }, { token, shutdown, intervalMs: 60000 });
    url = `http://127.0.0.1:${await server.start(0)}`;
  });
  afterEach(async () => { await server.stop(); jest.restoreAllMocks(); });
  test('enrollment accepts its single-use capability without exposing management routes', async () => {
    jest.spyOn(QueueService, 'getRedis').mockReturnValue({} as ReturnType<typeof QueueService.getRedis>);
    jest.spyOn(EnrollmentService, 'initialize').mockImplementation(() => undefined);
    const consume = jest.spyOn(EnrollmentService, 'consumeToken').mockResolvedValue(true);
    const response = await fetch(`${url}/api/workers/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'b'.repeat(64) }) });
    expect(response.status).toBe(200); expect(consume).toHaveBeenCalledWith('b'.repeat(64));
    expect((await fetch(`${url}/api/workers`)).status).toBe(401);
  });
  test('settings reject arbitrary keys and profile deletion rejects traversal', async () => {
    expect((await fetch(`${url}/api/settings`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ nodeOptions: '--inspect' }) })).status).toBe(400);
    expect((await fetch(`${url}/api/profiles/${encodeURIComponent('../outside')}`, { method: 'DELETE', headers })).status).toBe(400);
  });
  test('requires authentication, rejects foreign origins and DNS rebinding', async () => {
    expect((await fetch(`${url}/api/system`)).status).toBe(401);
    expect((await fetch(`${url}/api/system`, { headers: { ...headers, Origin: 'https://evil.example' } })).status).toBe(403);
    const rebound = await new Promise<number | undefined>((resolve, reject) => { get(`${url}/api/system`, { headers: { ...headers, Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject); });
    expect(rebound).toBe(403);
    expect((await fetch(`${url}/api/system`, { headers })).status).toBe(200);
    await expect(server.start(0, '0.0.0.0')).rejects.toThrow('127.0.0.1');
  });
  test('returns workers, sessions, queue stats and details', async () => {
    for (const kind of ['workers', 'sessions', 'queues'] as const) expect(await (await fetch(`${url}/api/${kind}`, { headers })).json()).toEqual(state[kind]);
    expect(await (await fetch(`${url}/api/workers/mac-1`, { headers })).json()).toEqual(state.workers[0]);
    expect((await fetch(`${url}/api/sessions/missing`, { headers })).status).toBe(404);
  });
  test('validates scheduling commands and refuses unsafe shutdown', async () => {
    expect((await fetch(`${url}/api/sessions`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'file:///etc/passwd' }) })).status).toBe(400);
    expect(submit).not.toHaveBeenCalled();
    state.system.counts.active = 1;
    expect((await fetch(`${url}/api/engine/shutdown`, { method: 'POST', headers })).status).toBe(409);
    state.system.counts.active = 0; state.system.redis = 'unavailable';
    expect((await fetch(`${url}/api/engine/shutdown`, { method: 'POST', headers })).status).toBe(409);
    expect(shutdown).not.toHaveBeenCalled(); state.system.redis = 'ready';
    expect((await fetch(`${url}/api/engine/shutdown`, { method: 'POST', headers })).status).toBe(202);
    await new Promise(resolve => setImmediate(resolve)); expect(shutdown).toHaveBeenCalledTimes(1);
  });
  test('streams an initial snapshot, normalized updates and reconnect snapshots', async () => {
    const events: ControlEvent[] = [];
    const ws = new WebSocket(url.replace('http:', 'ws:') + '/events', ['trafficbot', token]);
    await new Promise<void>((resolve, reject) => { ws.on('error', reject); ws.on('message', raw => { events.push(JSON.parse(raw.toString())); resolve(); }); });
    expect(events[0].type).toBe('snapshot');
    state.workers = []; await server.refresh();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(events.some(e => e.type === 'worker.offline' && e.workerId === 'mac-1')).toBe(true);
    ws.close();
    const reconnect = new WebSocket(url.replace('http:', 'ws:') + '/events', ['trafficbot', token]);
    const snapshot = await new Promise<ControlEvent>((resolve, reject) => { reconnect.on('error', reject); reconnect.once('message', raw => resolve(JSON.parse(raw.toString()))); });
    expect(snapshot).toMatchObject({ type: 'snapshot', data: { workers: [] } }); reconnect.close();
  });
  test('rejects an unauthenticated WebSocket', async () => {
    const ws = new WebSocket(url.replace('http:', 'ws:') + '/events');
    await expect(new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); })).rejects.toThrow('401');
  });
});
