import { mkdtemp, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { saveSettings } from './SettingsStore';
import dotenv from 'dotenv';
test('rejects arbitrary environment keys and newline injection, persists safely without mutating runtime', async () => {
  const original = process.env.TRAFFICBOT_CONTROL_DIR;
  const directory = await mkdtemp(join(tmpdir(), 'trafficbot-settings-'));
  process.env.TRAFFICBOT_CONTROL_DIR = directory;
  const old = process.env.LOG_LEVEL;
  try {
    await expect(saveSettings({ nodeOptions: '--inspect' })).rejects.toThrow();
    await expect(saveSettings({ sessionsDataDir: 'ok\nNODE_OPTIONS=evil' })).rejects.toThrow();
    await saveSettings({ logLevel: 'debug' });
    expect(await readFile(join(directory, '.env'), 'utf8')).toContain("LOG_LEVEL='debug'");
    await saveSettings({ sessionsDataDir: 'C:\\new\\reports' });
    expect(dotenv.parse(await readFile(join(directory, '.env'))).SESSIONS_DATA_DIR).toBe('C:\\new\\reports');
    expect(process.env.LOG_LEVEL).toBe(old);
  } finally { if (original === undefined) delete process.env.TRAFFICBOT_CONTROL_DIR; else process.env.TRAFFICBOT_CONTROL_DIR = original; }
});
