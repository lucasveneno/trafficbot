import { BrowserFamily, OperatingSystem } from './BrowserProfile';

export interface DevicePreset {
  id: string; browser: BrowserFamily; operatingSystem: OperatingSystem; osVersion: string;
  viewport: { width: number; height: number }; screen: { width: number; height: number; availWidth: number; availHeight: number };
  devicePixelRatio: number; mobile: boolean; touch: boolean;
  hardware: { cores: number; memory: number | null }; gpu: { vendor: string; renderer: string };
  locales: readonly string[]; timezone: string; model?: string;
}
function desktop(id: string, browser: BrowserFamily, operatingSystem: OperatingSystem, width: number, height: number, dpr = 1, gpuOverride?: { vendor: string; renderer: string }): DevicePreset {
  const apple = operatingSystem === 'macos';
  const defaultGpu = apple
    ? { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)' }
    : operatingSystem === 'windows'
      ? { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' }
      : { vendor: 'Intel', renderer: 'Mesa Intel(R) UHD Graphics 620 (KBL GT2)' };
  return { id, browser, operatingSystem, osVersion: apple ? '14.0.0' : operatingSystem === 'windows' ? '15.0.0' : '',
    viewport: { width, height: height - 120 }, screen: { width, height, availWidth: width, availHeight: height - 40 },
    devicePixelRatio: dpr, mobile: false, touch: false, hardware: { cores: 8, memory: browser === 'safari' || browser === 'firefox' ? null : 8 },
    gpu: gpuOverride ?? defaultGpu,
    locales: ['en-US', 'pt-BR', 'de-DE'], timezone: 'America/New_York' };
}
function phone(id: string, os: 'android' | 'ios', width: number, height: number, dpr: number, model: string): DevicePreset {
  return { id, browser: os === 'ios' ? 'safari' : 'chrome', operatingSystem: os, osVersion: os === 'ios' ? '18.0' : '14.0.0',
    viewport: { width, height: height - 90 }, screen: { width, height, availWidth: width, availHeight: height },
    devicePixelRatio: dpr, mobile: true, touch: true, hardware: { cores: os === 'ios' ? 6 : 8, memory: os === 'ios' ? null : 8 },
    gpu: os === 'ios' ? { vendor: 'Apple Inc.', renderer: 'Apple GPU' } : id.startsWith('pixel')
      ? { vendor: 'ARM', renderer: 'Mali-G710' } : { vendor: 'Qualcomm', renderer: 'Adreno (TM) 740' },
    locales: ['en-US', 'pt-BR'], timezone: 'America/New_York', model };
}
export const deviceCatalog: readonly DevicePreset[] = [
  // ── Desktop presets ─────────────────────────────────────────────────────────
  desktop('windows-chrome-1440', 'chrome', 'windows', 1440, 900),
  desktop('windows-chrome-1920', 'chrome', 'windows', 1920, 1080, 1,
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' }),
  desktop('windows-edge-1920', 'edge', 'windows', 1920, 1080, 1,
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' }),
  desktop('windows-chrome-1280', 'chrome', 'windows', 1280, 800),
  desktop('windows-chrome-2560', 'chrome', 'windows', 2560, 1440),
  desktop('macos-chrome', 'chrome', 'macos', 1440, 900, 2),
  desktop('macos-chrome-1920', 'chrome', 'macos', 1920, 1080, 2),
  desktop('macos-edge', 'edge', 'macos', 1440, 900, 2),
  { ...desktop('macos-safari', 'safari', 'macos', 1440, 900, 2), gpu: { vendor: 'Apple Inc.', renderer: 'Apple GPU' } },
  desktop('linux-chrome', 'chrome', 'linux', 1440, 900),
  desktop('linux-chrome-1280', 'chrome', 'linux', 1280, 800),
  desktop('linux-firefox', 'firefox', 'linux', 1920, 1080),
  // ── Mobile presets ──────────────────────────────────────────────────────────
  phone('pixel-7-chrome', 'android', 412, 915, 2.625, 'Pixel 7'),
  { ...phone('pixel-8-chrome', 'android', 412, 915, 2.625, 'Pixel 8'), gpu: { vendor: 'ARM', renderer: 'Mali-G715' } },
  phone('samsung-s23-chrome', 'android', 360, 780, 3, 'SM-S911B'),
  { ...phone('samsung-s24-chrome', 'android', 360, 780, 3, 'SM-S928B'), gpu: { vendor: 'ARM', renderer: 'Xclipse 940' } },
  { ...phone('oneplus-12-chrome', 'android', 412, 919, 3, 'CPH2573'), gpu: { vendor: 'Qualcomm', renderer: 'Adreno (TM) 750' } },
  phone('iphone-15-safari', 'ios', 393, 852, 3, 'iPhone'),
  phone('iphone-16-safari', 'ios', 393, 852, 3, 'iPhone'),
  phone('ipad-pro-safari', 'ios', 430, 932, 2, 'iPad'),
];
export function getDevice(id: string): DevicePreset {
  const device = deviceCatalog.find(item => item.id === id);
  if (!device) throw new Error(`Unknown browser device preset: ${id}`);
  return structuredClone(device);
}
