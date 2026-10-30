import { randomBytes, timingSafeEqual } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

export async function loadControlToken(directory = process.env.TRAFFICBOT_CONTROL_DIR || join(homedir(), '.trafficbot')): Promise<string> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'control-token');
  try { await writeFile(path, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  const token = (await readFile(path, 'utf8')).trim();
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid controller token file');
  return token;
}
export function validToken(value: string | undefined, token: string): boolean {
  const candidate = Buffer.from(value || ''); const expected = Buffer.from(token);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
export const controlOrigins = new Set(['http://localhost:1420', 'http://127.0.0.1:1420', 'tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']);
export function validOrigin(origin?: string): boolean { return !origin || controlOrigins.has(origin); }
