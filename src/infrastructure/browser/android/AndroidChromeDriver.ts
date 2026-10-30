import puppeteer, { Browser, Page } from 'puppeteer';
import { BrowserEngine, BrowserOptions } from '../../../domain/interfaces/BrowserEngine';
import { BrowserProfile } from '../profile/BrowserProfile';
import { createRuntimeProfile, applyRuntimeProfile } from '../profile/RuntimeProfile';
import { ProxyLocationProvider } from '../profile/ProxyLocationProvider';
import { sameOrigin } from '../../../domain/entities/SessionContract';
import { AdbClient } from '../../worker/android/AdbClient';
import { PortAllocator } from '../../worker/android/PortAllocator';
import { ProfileStore } from '../profile/ProfileStore';

export class AndroidChromeDriver implements BrowserEngine {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private profile?: BrowserProfile;
  private headers: Record<string, string> = {};
  private allowedOrigin?: string;
  private searchOrigins: string[] = [];
  private scopeError?: Error;
  private lastResponse?: { status: number; finalUrl: string };
  private localPort?: number;
  private deviceSerial: string;

  private deviceCapabilities: { serial: string; manufacturer?: string; model?: string; androidVersion?: string; sdkVersion?: number; };

  constructor(deviceCapabilities: { serial: string; manufacturer?: string; model?: string; androidVersion?: string; sdkVersion?: number; }) {
    this.deviceCapabilities = deviceCapabilities;
    this.deviceSerial = deviceCapabilities.serial;
  }

  getProfile(): BrowserProfile {
    if (!this.profile) throw new Error('Browser profile not initialized');
    return structuredClone(this.profile);
  }

  async captureFailureScreenshot(): Promise<Uint8Array | undefined> {
    if (!this.page || this.page.isClosed()) return undefined;
    return this.page.screenshot({ type: 'jpeg', quality: 55, fullPage: false });
  }

  navigationResult(allowFailure = false): { status: number; finalUrl: string } {
    if (!allowFailure && this.scopeError) throw this.scopeError;
    if (!this.lastResponse) throw new Error('No navigation response');
    if (!allowFailure && this.allowedOrigin && !sameOrigin(this.lastResponse.finalUrl, this.allowedOrigin)) throw new Error('Session did not reach configured origin');
    if (!allowFailure && this.lastResponse.status >= 400) throw new Error(`HTTP failure: ${this.lastResponse.status}`);
    return this.lastResponse;
  }

  async init(options: BrowserOptions): Promise<void> {
    this.profile = undefined;
    this.headers = {};

    AdbClient.startChromeDevTools(this.deviceSerial);
    // Wait briefly for Chrome to start and DevTools socket to become available
    await new Promise(r => setTimeout(r, 2000));

    this.localPort = await PortAllocator.allocate();
    try {
      AdbClient.forwardPort(this.deviceSerial, this.localPort);
    } catch (e) {
      PortAllocator.release(this.localPort);
      throw e;
    }

    try {
      this.browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${this.localPort}`,
        defaultViewport: null // Use actual device viewport
      });
      this.browser.on('disconnected', () => {
        require('../../logging/logger').logger.warn('Android Chrome DevTools disconnected', { serial: this.deviceSerial });
        require('../../monitoring/MetricsService').MetricsService.getInstance().trackAdbDisconnect(this.deviceSerial);
        this.cleanupForwarding();
      });
    } catch (e) {
      this.cleanupForwarding();
      throw new Error(`Failed to connect to Android Chrome on ${this.deviceSerial}: ${e}`);
    }

    const pages = await this.browser.pages();
    this.page = pages[0] || await this.browser.newPage();

    if (options.proxy?.username && options.proxy.password) await this.page.authenticate({ username: options.proxy.username, password: options.proxy.password });
    let location;
    if (options.proxyLocationEndpoint) {
      if (!options.proxy) throw new Error('Proxy location matching requires a browser proxy');
      const locationPage = await this.browser.newPage();
      try {
        if (options.proxy.username && options.proxy.password) await locationPage.authenticate({ username: options.proxy.username, password: options.proxy.password });
        location = await ProxyLocationProvider.resolve(locationPage, options.proxyLocationEndpoint);
      } finally { await locationPage.close(); }
    }
    
    // Android storage persistence is handled organically by the device,
    // but we still pass options.userDataDir to createRuntimeProfile so that
    // browser-profile.json metadata is saved to the desktop filesystem.
    const extraMetadata = {
      deviceSerial: this.deviceSerial,
      device: {
        manufacturer: this.deviceCapabilities.manufacturer,
        model: this.deviceCapabilities.model,
        androidVersion: this.deviceCapabilities.androidVersion,
        sdkVersion: this.deviceCapabilities.sdkVersion
      }
    };
    this.profile = await createRuntimeProfile(this.browser, options.deviceProfile, options.userDataDir, location, extraMetadata);
    
    // Validate persistence constraints
    const strategy = ProfileStore.getStrategy(this.profile);
    await strategy.validate(this.profile, this.deviceSerial);
    
    await applyRuntimeProfile(this.page, this.profile);
    
    this.headers = { 'accept-language': this.profile.acceptLanguage };
    await this.page.setExtraHTTPHeaders(this.headers);

    if (options.grantGeolocation) {
      if (!location || location.latitude === undefined || location.longitude === undefined || !options.allowedOrigin)
        throw new Error('Geolocation permission requires proxy coordinates and a configured target origin');
      await this.page.setGeolocation({ latitude: location.latitude, longitude: location.longitude, accuracy: 1000 });
      await this.browser.defaultBrowserContext().overridePermissions(options.allowedOrigin, ['geolocation']);
    }

    this.allowedOrigin = options.allowedOrigin;
    this.searchOrigins = options.searchOrigins || [];
    this.scopeError = undefined;
    this.lastResponse = undefined;
    await this.page.setRequestInterception(true);
    this.page.on('request', request => {
      if (request.isNavigationRequest() && request.frame() === this.page?.mainFrame()) {
        const url = request.url();
        if (this.allowedOrigin && !sameOrigin(url, this.allowedOrigin) && !this.searchOrigins.some(origin => sameOrigin(url, origin))) {
          this.scopeError = new Error(`Navigation blocked: destination outside configured origin (url=${url})`);
          void request.abort().catch(() => undefined);
          return;
        }
      }
      void request.continue().catch(() => undefined);
    });
    this.page.on('response', response => {
      if (response.frame() === this.page?.mainFrame() && response.request().isNavigationRequest()) {
        this.lastResponse = { status: response.status(), finalUrl: response.url() };
      }
    });
  }

  async navigate(url: string): Promise<void> {
    if (!this.page) throw new Error('Browser not initialized');
    this.scopeError = undefined;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  async close(): Promise<void> {
    try {
      if (this.browser) {
        await this.browser.disconnect(); // Disconnect instead of close so Chrome stays installed/running
        this.browser = null;
      }
    } finally {
      this.cleanupForwarding();
    }
  }

  private cleanupForwarding() {
    if (this.localPort) {
      AdbClient.removeForward(this.deviceSerial, this.localPort);
      PortAllocator.release(this.localPort);
      this.localPort = undefined;
    }
  }

  async wait(ms: number): Promise<void> { await new Promise(r => setTimeout(r, ms)); }
  async evaluate<T>(fn: (...args: any[]) => T, ...args: any[]): Promise<T> { return this.page!.evaluate(fn, ...args); }
  async scroll(deltaX: number, deltaY: number): Promise<void> { await this.page!.evaluate((dx, dy) => window.scrollBy(dx, dy), deltaX, deltaY); }
  async mouseMove(x: number, y: number): Promise<void> { await this.page!.mouse.move(x, y); }
  async click(x: number, y: number): Promise<void> { await this.page!.mouse.click(x, y); }
  async pressKey(key: string): Promise<void> {
    if (this.page) {
      await (this.page.keyboard as any).press(key);
    }
  }
  async setExtraHeaders(headers: Record<string, string>): Promise<void> { await this.page!.setExtraHTTPHeaders({ ...this.headers, ...headers }); }
  async setGeolocation(latitude: number, longitude: number): Promise<void> { 
    await this.page!.setGeolocation({ latitude, longitude, accuracy: 1000 });
    const context = this.browser!.defaultBrowserContext();
    await context.overridePermissions(this.page!.url(), ['geolocation']);
  }
  async waitForNetworkIdle(): Promise<void> {
    try { await this.page!.waitForNetworkIdle({ idleTime: 1000, timeout: 15000 }); } catch (e) {}
  }
  async randomDelay(min: number, max: number): Promise<void> { await this.wait(Math.floor(Math.random() * (max - min + 1)) + min); }
  
  async clickLinkByHref(href: string): Promise<boolean> {
    try {
      const link = await this.page!.$(`a[href="${href}"]`);
      if (link) {
        await this.page!.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), link);
        await this.randomDelay(500, 1500);
        await link.click({ delay: Math.random() * 200 + 100 });
        return true;
      }
      return false;
    } catch { return false; }
  }

  async clickLinkContainingHref(partialHref: string): Promise<boolean> {
    try {
      const links = await this.page!.$$('a');
      for (const link of links) {
        const href = await this.page!.evaluate(el => el.getAttribute('href'), link);
        if (href && href.includes(partialHref)) {
          await this.page!.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), link);
          await this.randomDelay(500, 1500);
          await link.click({ delay: Math.random() * 200 + 100 });
          return true;
        }
      }
      return false;
    } catch { return false; }
  }

  async clickLinkByText(text: string): Promise<boolean> {
    try {
      const links = await this.page!.$$('a');
      for (const link of links) {
        const linkText = await this.page!.evaluate(el => el.textContent, link);
        if (linkText && linkText.includes(text)) {
          await this.page!.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), link);
          await this.randomDelay(500, 1500);
          await link.click({ delay: Math.random() * 200 + 100 });
          return true;
        }
      }
      return false;
    } catch { return false; }
  }

  async clickNextSearchPage(): Promise<boolean> { return this.clickLinkByText('Next'); }
  async clickSearchResult(pattern: string): Promise<boolean> { return this.clickLinkContainingHref(pattern); }
  
  async searchKeyword(keyword: string): Promise<void> {
    const input = await this.page!.$('input[name="q"]');
    if (input) {
      await input.focus();
      await this.page!.keyboard.type(keyword, { delay: 100 });
      await this.page!.keyboard.press('Enter');
      await this.page!.waitForNavigation({ waitUntil: 'domcontentloaded' });
    }
  }

  async handleConsentPopups(): Promise<boolean> {
    const commonSelectors = ['button[id*="accept"]', 'button[class*="accept"]'];
    for (const selector of commonSelectors) {
      try {
        const button = await this.page!.$(selector);
        if (button) {
          await button.click();
          return true;
        }
      } catch {}
    }
    return false;
  }
}
