import { Browser, Page } from 'puppeteer';
import { BrowserProfile, validateProfile } from './BrowserProfile';
import { BrowserProfileGenerator, ProfileLocation } from './BrowserProfileGenerator';
import { ClientHintsProvider } from './ClientHintsProvider';
import { LocaleProvider } from './LocaleProvider';
import { ProfileStore } from './ProfileStore';
import { UserAgentProvider } from './UserAgentProvider';

export function reconcileRuntimeProfile(profile: BrowserProfile, stored?: BrowserProfile, location?: ProfileLocation): BrowserProfile {
  if (!stored) return validateProfile(profile);
  validateProfile(stored);
  if (stored.source !== 'runtime' || stored.browser !== profile.browser || stored.operatingSystem !== profile.operatingSystem || stored.deviceId !== profile.deviceId || JSON.stringify(stored.gpu) !== JSON.stringify(profile.gpu) || JSON.stringify(stored.hardware) !== JSON.stringify(profile.hardware))
    throw new Error('Stored profile is incompatible with this runtime/device; use its original environment or a new session key');
  if (location && (stored.country !== location.country || stored.timezone !== location.timezone || stored.locale !== location.locale))
    throw new Error('Proxy location changed for persistent identity; keep its original location or use a new session key');
  // Installed browser updates change versions, while user/device preferences remain stable.
  return validateProfile({ ...stored, browserVersion: profile.browserVersion, engineVersion: profile.engineVersion, userAgent: profile.userAgent, clientHints: profile.clientHints, osVersion: profile.osVersion });
}

export async function createRuntimeProfile(browser: Browser, requestedDevice = 'native', directory?: string, location?: ProfileLocation, extraMetadata?: Partial<BrowserProfile>): Promise<BrowserProfile> {
  const release = UserAgentProvider.fromInstalledVersion(await browser.version());
  if (release.browser !== 'chrome') throw new Error('This runtime adapter requires real Chrome; other browser families need their native engine adapter');
  const os = BrowserProfileGenerator.hostOS();
  const deviceId = requestedDevice === 'native' ? `${os}-chrome${os === 'windows' ? '-1440' : ''}` : requestedDevice;
  const base = BrowserProfileGenerator.generate(deviceId, release, location);
  if (base.operatingSystem !== os || base.mobile) throw new Error('Preset requires a different native OS/device; cross-OS and mobile impersonation are unsupported');
  const probe = await browser.newPage();
  try {
    // Reserved synthetic secure origin, fulfilled in memory: no external probing request.
    await probe.setRequestInterception(true);
    probe.on('request', request => { void request.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Profile observation</title>' }).catch(() => undefined); });
    await probe.goto('https://trafficbot-profile.invalid/');
    const native = await probe.evaluate(async () => {
      const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { getHighEntropyValues: (keys: string[]) => Promise<{ architecture: string; bitness: string; platformVersion: string; model: string }> } };
      const gl = document.createElement('canvas').getContext('webgl');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      const gpu = debug ? { vendor: String(gl!.getParameter(debug.UNMASKED_VENDOR_WEBGL)), renderer: String(gl!.getParameter(debug.UNMASKED_RENDERER_WEBGL)) } : { vendor: '', renderer: '' };
      return { hardware: { cores: navigator.hardwareConcurrency, memory: nav.deviceMemory ?? null }, gpu,
        platform: navigator.platform, locale: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        metadata: await nav.userAgentData?.getHighEntropyValues(['architecture', 'bitness', 'platformVersion', 'model']) };
    });
    if (native.platform !== base.platform && !(base.platform === 'Linux x86_64' && native.platform.startsWith('Linux'))) throw new Error(`Native platform is not supported by this device adapter: expected ${base.platform}, got ${native.platform}`);
    let profile = validateProfile({ ...base, source: 'runtime', hardware: native.hardware, gpu: native.gpu,
      screen: { ...base.screen, availWidth: base.screen.width, availHeight: base.screen.height },
      ...LocaleProvider.values(location?.locale || native.locale), timezone: location?.timezone || native.timezone,
      osVersion: native.metadata?.platformVersion || base.osVersion,
      clientHints: { ...base.clientHints!,
        architecture: native.metadata?.architecture || base.clientHints!.architecture,
        bitness: native.metadata?.bitness || base.clientHints!.bitness,
        platformVersion: native.metadata?.platformVersion || base.clientHints!.platformVersion,
        model: native.metadata?.model || '',
      },
      ...extraMetadata
    });
    const stored = directory ? await ProfileStore.read(directory) : undefined;
    profile = reconcileRuntimeProfile(profile, stored, location);
    if (directory) await ProfileStore.write(directory, profile);
    return profile;
  } finally { await probe.close(); }
}

export async function applyRuntimeProfile(page: Page, profile: BrowserProfile): Promise<void> {
  validateProfile(profile);
  await page.setViewport({ ...profile.viewport, deviceScaleFactor: profile.devicePixelRatio, isMobile: profile.mobile, hasTouch: profile.touch });
  await page.emulateTimezone(profile.timezone);
  const session = await page.createCDPSession();
  await session.send('Emulation.setUserAgentOverride', {
    userAgent: profile.userAgent, platform: profile.platform, acceptLanguage: profile.languages.join(','),
    userAgentMetadata: ClientHintsProvider.metadata(profile),
  });
  await session.send('Emulation.setLocaleOverride', { locale: profile.locale });
  await session.send('Emulation.setDeviceMetricsOverride', {
    ...profile.viewport, deviceScaleFactor: profile.devicePixelRatio, mobile: profile.mobile,
    screenWidth: profile.screen.width, screenHeight: profile.screen.height,
  });
  // Chrome's emulated available screen is the emulated screen. Store the actual applied dimensions.
  // Canvas/audio/fonts/WebGL/hardware/permissions remain native; no prototype patching.
}
