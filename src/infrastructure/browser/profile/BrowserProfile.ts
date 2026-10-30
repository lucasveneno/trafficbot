import { z } from 'zod';
import { UserAgentProvider } from './UserAgentProvider';
import { countryLocales, LocaleProvider } from './LocaleProvider';
import { TimezoneProvider } from './TimezoneProvider';

export const browserFamilySchema = z.enum(['chrome', 'edge', 'firefox', 'safari']);
export const operatingSystemSchema = z.enum(['windows', 'macos', 'linux', 'android', 'ios']);
export type BrowserFamily = z.infer<typeof browserFamilySchema>;
export type OperatingSystem = z.infer<typeof operatingSystemSchema>;
export const platforms: Record<OperatingSystem, string> = {
  windows: 'Win32', macos: 'MacIntel', linux: 'Linux x86_64', android: 'Linux armv8l', ios: 'iPhone',
};
export const hintPlatforms: Record<OperatingSystem, string> = {
  windows: 'Windows', macos: 'macOS', linux: 'Linux', android: 'Android', ios: 'iOS',
};
const size = z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict();
const brand = z.object({ brand: z.string(), version: z.string() }).strict();
export const clientHintsSchema = z.object({
  secChUa: z.string(), secChUaMobile: z.enum(['?0', '?1']), secChUaPlatform: z.string(),
  brands: z.array(brand), fullVersionList: z.array(brand),
  platformVersion: z.string(), architecture: z.string(), bitness: z.string(), model: z.string(),
}).strict();
export const browserProfileSchema = z.object({
  schemaVersion: z.literal(1), id: z.string().min(1), deviceId: z.string().min(1),
  source: z.enum(['catalog', 'runtime']), browser: browserFamilySchema, operatingSystem: operatingSystemSchema,
  browserVersion: z.string().regex(/^\d+(?:\.\d+){1,3}$/), osVersion: z.string(),
  engineVersion: z.string().regex(/^\d+(?:\.\d+){1,3}$/).optional(),
  deviceSerial: z.string().optional(),
  device: z.object({
    manufacturer: z.string().optional(),
    model: z.string().optional(),
    androidVersion: z.string().optional(),
    sdkVersion: z.number().optional()
  }).optional(),
  userAgent: z.string().min(1), clientHints: clientHintsSchema.nullable(),
  viewport: size, screen: size.extend({ availWidth: z.number().int().positive(), availHeight: z.number().int().positive() }).strict(),
  devicePixelRatio: z.number().finite().positive(), mobile: z.boolean(), touch: z.boolean(),
  locale: z.string().min(2), languages: z.array(z.string().min(2)).min(1), acceptLanguage: z.string(),
  timezone: z.string().refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }),
  country: z.string().regex(/^[A-Z]{2}$/).optional(),
  hardware: z.object({ cores: z.number().int().positive(), memory: z.number().finite().positive().nullable() }).strict(),
  gpu: z.object({ vendor: z.string(), renderer: z.string() }).strict(),
  platform: z.string(), rendering: z.literal('native'), permissions: z.literal('native'),
}).strict().superRefine((profile, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const chromium = profile.browser === 'chrome' || profile.browser === 'edge';
  if (profile.platform !== platforms[profile.operatingSystem]) fail('Platform and operating system disagree');
  if (profile.browser === 'safari' && !['macos', 'ios'].includes(profile.operatingSystem)) fail('Safari requires an Apple OS');
  if (profile.operatingSystem === 'ios' && profile.browser !== 'safari') fail('Only Safari iOS is modeled');
  if (profile.mobile !== ['android', 'ios'].includes(profile.operatingSystem)) fail('Mobile mode and OS disagree');
  if (profile.mobile && (!profile.touch || profile.viewport.width > 600)) fail('Phone preset requires touch and a phone viewport');
  if (profile.viewport.width > profile.screen.width || profile.viewport.height > profile.screen.height || profile.screen.availWidth > profile.screen.width || profile.screen.availHeight > profile.screen.height) fail('Viewport/available screen exceeds screen dimensions');
  if (profile.languages[0] !== profile.locale || !profile.acceptLanguage.startsWith(profile.locale)) fail('Locale and language signals disagree');
  const osTokens: Record<OperatingSystem, string> = { windows: 'Windows NT', macos: 'Macintosh', linux: 'X11; Linux', android: 'Android', ios: 'iPhone' };
  if (!profile.userAgent.includes(osTokens[profile.operatingSystem])) fail('UA and OS disagree');
  const major = profile.browserVersion.split('.')[0];
  const token = { chrome: `Chrome/${major}.`, edge: `Edg/${major}.`, firefox: `Firefox/${major}.`, safari: `Version/${profile.browserVersion}` }[profile.browser];
  if (!profile.userAgent.includes(token)) fail('UA browser/version disagrees');
  try {
    const language = LocaleProvider.values(profile.locale);
    if (profile.acceptLanguage !== language.acceptLanguage || JSON.stringify(profile.languages) !== JSON.stringify(language.languages)) fail('Language headers and navigator languages must share one locale policy');
    if (profile.userAgent !== UserAgentProvider.create({ browser: profile.browser, version: profile.browserVersion, engineVersion: profile.engineVersion }, profile.operatingSystem, profile.osVersion)) fail('UA must be derived from the profile release and OS');
    TimezoneProvider.validate(profile.timezone, profile.country);
    if (profile.country && !countryLocales[profile.country]?.includes(profile.locale)) fail('Locale does not match configured country policy');
  } catch { fail('Unsupported browser/OS/location combination'); }
  if (chromium !== !!profile.clientHints) fail('Client hints must be present only for Chromium profiles');
  if (profile.clientHints) {
    const hints = profile.clientHints;
    const expectedBrand = profile.browser === 'edge' ? 'Microsoft Edge' : 'Google Chrome';
    if (hints.secChUaPlatform !== JSON.stringify(hintPlatforms[profile.operatingSystem]) || hints.secChUaMobile !== (profile.mobile ? '?1' : '?0')) fail('Client hints disagree with OS/mobile mode');
    const engineVersion = profile.engineVersion || profile.browserVersion;
    if (!hints.brands.some(b => b.brand === expectedBrand && b.version === major) || !hints.brands.some(b => b.brand === 'Chromium' && b.version === engineVersion.split('.')[0])) fail('Client hint brands/version disagree');
    if (!hints.fullVersionList.some(b => b.brand === expectedBrand && b.version === profile.browserVersion)) fail('Full browser version disagrees');
    if (!hints.fullVersionList.some(b => b.brand === 'Chromium' && b.version === engineVersion)) fail('Full engine version disagrees');
    if (hints.platformVersion !== profile.osVersion) fail('Client hint OS version disagrees');
    if (hints.secChUa !== hints.brands.map(b => `${JSON.stringify(b.brand)};v=${JSON.stringify(b.version)}`).join(', ')) fail('Client hint header and metadata disagree');
  }
  if (profile.operatingSystem === 'windows' && /Apple|Mali|Adreno/.test(profile.gpu.renderer)) fail('GPU incompatible with Windows');
  if (profile.operatingSystem !== 'windows' && /Direct3D/.test(profile.gpu.renderer)) fail('Direct3D GPU incompatible with OS');
  if (profile.browser === 'firefox' || profile.browser === 'safari') {
    if (profile.hardware.memory !== null) fail('deviceMemory is unavailable in this browser family');
  }
});
export type BrowserProfile = z.infer<typeof browserProfileSchema>;
export function validateProfile(value: unknown): BrowserProfile { return browserProfileSchema.parse(value); }
