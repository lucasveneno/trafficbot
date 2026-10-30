import { ConfigSchema, parseConfig } from './config';
import { sessionJobSchema, sameOrigin, proxyServer } from '../../domain/entities/SessionContract';

describe('Production configuration and payload contract', () => {
  test.each(['', '0', '-1', 'Infinity', 'NaN', '2minutes', ' '])('rejects duration %s', SESSION_TIME => {
    expect(() => ConfigSchema.parse({ SESSION_TIME })).toThrow();
    expect(() => parseConfig({ SESSION_TIME })).toThrow();
  });
  test.each(['0.01', '3', 'random'])('accepts duration %s', SESSION_TIME => {
    expect(ConfigSchema.parse({ SESSION_TIME }).SESSION_TIME).toBe(SESSION_TIME);
  });
  test('defaults and URL alias are deterministic', () => {
    expect(parseConfig({}).MAX_SESSIONS).toBe(1);
    expect(parseConfig({ URL: 'http://localhost:8000/', PROXY_PORT: '' }).DEFAULT_URL).toBe('http://localhost:8000/');
  });
  test.each([
    { PROXY_URL: 'proxy' }, { PROXY_PORT: 80 },
    { PROXY_URL: 'http://user:secret@proxy', PROXY_PORT: 80 },
    { PROXY_URL: 'ftp://proxy', PROXY_PORT: 80 },
    { PROXY_URL: 'proxy/path', PROXY_PORT: 80 },
    { PROXY_URL: 'http://proxy:80', PROXY_PORT: 80 },
    { PROXY_URL: 'proxy', PROXY_PORT: 65536 },
    { PROXY_URL: 'proxy', PROXY_PORT: 80, PROXY_USER: 'user' },
  ])('rejects incomplete or unsafe proxy combinations', proxy => {
    expect(() => parseConfig(proxy)).toThrow();
  });
  test('validates and formats proxy', () => {
    expect(parseConfig({ PROXY_URL: 'https://proxy', PROXY_PORT: '443' }).PROXY_PORT).toBe(443);
    expect(proxyServer({ host: 'socks5://proxy', port: 9050 })).toBe('socks5://proxy:9050');
  });
  test('geography matching requires proxy lookup and explicit permission policy', () => {
    expect(() => parseConfig({ MATCH_GEOLOCATION: 'true' })).toThrow();
    expect(() => parseConfig({ GRANT_GEOLOCATION: 'true' })).toThrow();
    expect(parseConfig({ MATCH_GEOLOCATION: 'true', PROXY_LOCATION_URL: 'https://lookup.example/location', PROXY_URL: 'proxy', PROXY_PORT: '8080' }))
      .toMatchObject({ MATCH_GEOLOCATION: true, GRANT_GEOLOCATION: false, BROWSER_PROFILE: 'native' });
    expect(parseConfig({ BOT_ROLE: 'worker', MATCH_GEOLOCATION: 'true', PROXY_LOCATION_URL: 'https://lookup.example/location' }).MATCH_GEOLOCATION).toBe(true);
  });
  test('rejects malformed queue payloads and traversal', () => {
    const valid = { url: 'http://localhost/', durationMinutes: 0.1, intensity: 'low', persistent: true, profileKey: 'profile-1' };
    expect(sessionJobSchema.parse(valid)).toEqual({ ...valid, behaviorModel: "generic" });
    for (const patch of [{ durationMinutes: Infinity }, { profileKey: '../escape' }, { url: 'file:///etc/passwd' }, { unexpected: true }])
      expect(() => sessionJobSchema.parse({ ...valid, ...patch })).toThrow();
  });
  test.each(['https://example.com.evil.test/', 'https://sub.example.com/', 'http://example.com/', 'https://example.com:8443/'])('rejects outside origin %s', target => {
    expect(sameOrigin(target, 'https://example.com/')).toBe(false);
  });
  test('accepts exact origin with normalized default port', () => {
    expect(sameOrigin('https://example.com:443/path', 'https://example.com/')).toBe(true);
  });
});

describe('shared execution settings', () => {
  const { makeJob } = require('./session');
  test('random duration is resolved once, with consistent 1–5 minute bounds', () => {
    const config = parseConfig({ SESSION_TIME: 'random', PERSISTENT_SESSIONS: 'true', BEHAVIOR_INTENSITY: 'high' });
    expect(makeJob(config, 0, () => 0)).toMatchObject({ durationMinutes: 1, intensity: 'high', persistent: true, profileKey: 'session-0' });
    expect(makeJob(config, 0, () => 0.999)).toMatchObject({ durationMinutes: 5, profileKey: 'session-0' });
  });
});
