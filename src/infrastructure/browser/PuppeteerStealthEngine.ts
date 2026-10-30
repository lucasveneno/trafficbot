import puppeteer from 'puppeteer';
import { Browser, Page, LaunchOptions } from 'puppeteer';

import { BrowserEngine, BrowserOptions } from '../../domain/interfaces/BrowserEngine';
import { sameOrigin } from '../../domain/entities/SessionContract';
import { logger } from '../logging/logger';
import { BrowserProfile } from './profile/BrowserProfile';
import { createRuntimeProfile, applyRuntimeProfile } from './profile/RuntimeProfile';
import { ProxyLocationProvider } from './profile/ProxyLocationProvider';
import { BrowserEngineConfig, defaultBrowserConfig } from './BrowserEngineConfig';

import { ProfileStore } from './profile/ProfileStore';

export type NavigationState = 'idle' | 'navigating' | 'loaded' | 'interacting' | 'failed';

/** Returns the keyboard modifier key used for text selection shortcuts on the given platform. */
export function selectKeyboardModifier(platform: NodeJS.Platform): 'Meta' | 'Control' {
  return platform === 'darwin' ? 'Meta' : 'Control';
}

export class PuppeteerStealthEngine implements BrowserEngine {
  private browser: Browser | null = null;
  private closing?: Promise<void>;
  private launching?: Promise<Browser>;
  private cancelled = false;
  private page: Page | null = null;
  private profile?: BrowserProfile;
  private headers: Record<string, string> = {};
  private config: BrowserEngineConfig = defaultBrowserConfig;
  private navigationState: NavigationState = 'idle';

  getNavigationState(): NavigationState { return this.navigationState; }

  getProfile(): BrowserProfile {
    if (!this.profile) throw new Error('Browser profile not initialized');
    return structuredClone(this.profile);
  }

  private allowedOrigin?: string;
  private searchOrigins: string[] = [];
  private scopeError?: Error;
  private lastResponse?: { status: number; finalUrl: string };
  private navigationTimeoutMs = 60000;
  private waits = new Map<NodeJS.Timeout, () => void>();

  navigationResult(allowFailure = false): { status: number; finalUrl: string } {
    if (!allowFailure && this.scopeError) throw this.scopeError;
    if (!this.lastResponse) throw new Error('No navigation response');
    if (!allowFailure && this.allowedOrigin && !sameOrigin(this.lastResponse.finalUrl, this.allowedOrigin)) throw new Error('Session did not reach configured origin');
    if (!allowFailure && this.lastResponse.status >= 400) throw new Error(`HTTP failure: ${this.lastResponse.status}`);
    return this.lastResponse;
  }

  async init(options: BrowserOptions): Promise<void> {
    this.closing = undefined;
    this.cancelled = false;
    this.profile = undefined;
    this.headers = {};
    const args = [
      '--window-position=0,0',
      '--no-first-run',
      '--disable-infobars',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-default-browser-check',
    ];

    if (options.proxy) {
      args.push(`--proxy-server=${options.proxy.server}`);
    }

    const launchOptions: LaunchOptions = {
      headless: options.headless !== false,
      args,
      defaultViewport: { width: 1280, height: 720 }, // Replaced by the validated profile before target navigation.
    };

    const workerCapabilities = require('../worker/WorkerRegistry').WorkerRegistry.getCurrentCapabilities();
    const { BrowserExecutableResolver } = require('./BrowserExecutableResolver');
    const executablePath = BrowserExecutableResolver.resolveExecutable(options.deviceProfile, require('os').platform(), workerCapabilities);
    if (executablePath) {
      launchOptions.executablePath = executablePath;
    }


    if (options.userDataDir) {
      await ProfileStore.prepareChromePreferences(options.userDataDir);
      launchOptions.userDataDir = options.userDataDir;
    }

    this.launching = puppeteer.launch(launchOptions);
    this.browser = await this.launching;
    if (this.cancelled) { await this.close(); throw new Error('Session cancelled during launch'); }
    // Puppeteer's explicit initial about:blank prevents Chrome from restoring a
    // previous tab before identity and navigation policy are installed.
    const pages = await this.browser!.pages();
    this.page = pages[0] || await this.browser!.newPage();

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
    this.profile = await createRuntimeProfile(this.browser, options.deviceProfile, options.userDataDir, location);
    
    const strategy = ProfileStore.getStrategy(this.profile);
    await strategy.validate(this.profile);
    
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
    this.navigationTimeoutMs = options.navigationTimeoutMs || 60000;
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
        if (this.allowedOrigin && sameOrigin(url, this.allowedOrigin)) this.searchOrigins = [];
      }
      void request.continue().catch(() => undefined);
    });
    this.page.on('response', response => {
      if (response.request().isNavigationRequest() && response.frame() === this.page?.mainFrame()) {
        this.lastResponse = { status: response.status(), finalUrl: response.url() };
      }
    });
    // Popups are outside the session's controlled navigation path.
    this.page.on('popup', page => { void page?.close(); });

    logger.debug('Browser initialized with consistent profile', { deviceId: this.profile.deviceId, browserVersion: this.profile.browserVersion });
    this.navigationState = 'idle';
  }

  async navigate(url: string): Promise<void> {
    if (!this.page) throw new Error('Engine not initialized');
    this.navigationState = 'navigating';
    try {
      const response = await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.navigationTimeoutMs });
      if (this.scopeError) { this.navigationState = 'failed'; throw this.scopeError; }
      if (!response) { this.navigationState = 'failed'; throw new Error('Missing navigation response'); }
      if (response.status() >= 400) { this.navigationState = 'failed'; throw new Error(`HTTP failure: ${response.status()}`); }
      this.navigationState = 'loaded';
    } catch (e) {
      this.navigationState = 'failed';
      throw e;
    }
  }

  async wait(ms: number): Promise<void> {
    if (!this.page) throw new Error('Engine not initialized');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { this.waits.delete(timer); resolve(); }, ms);
      this.waits.set(timer, () => { clearTimeout(timer); reject(new Error('Session cancelled')); });
    });
  }

  async evaluate<T>(fn: (...args: any[]) => T, ...args: any[]): Promise<T> {
    if (!this.page) throw new Error('Engine not initialized');
    return await this.page.evaluate(fn, ...args);
  }

  async scroll(deltaX: number, deltaY: number): Promise<void> {
    if (!this.page) throw new Error('Engine not initialized');
    await (this.page as any).mouse.wheel({ deltaX, deltaY });
  }

  async mouseMove(x: number, y: number): Promise<void> {
    if (!this.page) throw new Error('Engine not initialized');
    await this.page.mouse.move(x, y, { steps: 5 }); // Use steps for smoother movement
  }

  async click(x: number, y: number): Promise<void> {
    if (!this.page) throw new Error('Engine not initialized');
    await this.page.mouse.click(x, y);
  }

  async pressKey(key: string): Promise<void> {
    if (!this.page) throw new Error('Engine not initialized');
    await (this.page.keyboard as any).press(key);
  }

  async close(): Promise<void> {
    if (this.closing) return this.closing;
    this.cancelled = true;
    for (const cancel of this.waits.values()) cancel();
    this.waits.clear();
    this.closing = (async () => {
      const browser = this.browser || await this.launching?.catch(() => undefined);
      this.browser = null;
      this.page = null;
      this.navigationState = 'idle';
      if (browser) {
        try { await browser.close(); }
        catch (error) { browser.process()?.kill('SIGKILL'); throw error; }
      }
    })();
    return this.closing;
  }

  async setExtraHeaders(headers: Record<string, string>): Promise<void> {
    if (!this.page) throw new Error('Engine not initialized');
    for (const [name, value] of Object.entries(headers)) {
      if (/^(user-agent|accept-language|sec-ch-)/i.test(name)) throw new Error('Identity headers must come from BrowserProfile');
      this.headers[name.toLowerCase()] = value;
    }
    await this.page.setExtraHTTPHeaders(this.headers);
  }

  async setGeolocation(latitude: number, longitude: number): Promise<void> {
    if (!this.page) throw new Error('Engine not initialized');
    await this.page.setGeolocation({ latitude, longitude, accuracy: 100 });
    
    // Also need to grant permission for geolocation
    const context = this.browser!.defaultBrowserContext();
    await context.overridePermissions(this.page.url(), ['geolocation']);
  }

  async waitForNetworkIdle(): Promise<void> {
    if (!this.page) throw new Error('Engine not initialized');
    try {
      await this.page.waitForNetworkIdle({ idleTime: this.config.networkIdleWaitMs, timeout: this.config.networkIdleTimeoutMs });
    } catch (e) {
      // Ignore network idle timeouts, some pages never fully idle
    }
  }

  async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await this.wait(delay);
  }

  async clickLinkByHref(href: string): Promise<boolean> {
    if (!this.page) throw new Error('Engine not initialized');
    try {
      const link = await this.page.$(`a[href="${href}"]`);
      if (link) {
        // Robust click
        await this.page.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), link);
        await this.randomDelay(500, 1500);
        await link.click({ delay: Math.random() * 200 + 100 });
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  async clickLinkContainingHref(partialHref: string): Promise<boolean> {
    if (!this.page) throw new Error('Engine not initialized');
    try {
      const links = await this.page.$$('a');
      for (const link of links) {
        const href = await this.page.evaluate(el => el.getAttribute('href'), link);
        if (href && href.includes(partialHref)) {
          // Robust click
          await this.page.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), link);
          await this.randomDelay(500, 1500);
          await link.click({ delay: Math.random() * 200 + 100 });
          return true;
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  async clickLinkByText(text: string): Promise<boolean> {
    if (!this.page) throw new Error('Engine not initialized');
    try {
      // Look for links that contain the text
      const links = await this.page.$$('a');
      for (const link of links) {
        const linkText = await this.page.evaluate(el => el.textContent, link);
        if (linkText && linkText.toLowerCase().includes(text.toLowerCase())) {
          // Robust click
          await this.page.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), link);
          await this.randomDelay(500, 1500);
          await link.click({ delay: Math.random() * 200 + 100 });
          return true;
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  async clickNextSearchPage(): Promise<boolean> {
    if (!this.page) throw new Error('Engine not initialized');
    try {
      const nextSelectors = [
        'a#pnnext', // Google
        'a.sb_pagN', // Bing
        'a.page-link[aria-label="Next page"]', // Bing alternative
        'button#more-results', // DuckDuckGo
        'a:contains("Next")', // Generic text-based fallback
      ];

      for (const selector of nextSelectors) {
        const nextButton = await this.page.$(selector);
        if (nextButton) {
          await this.page.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), nextButton);
          await this.randomDelay(500, 1500);
          await nextButton.click({ delay: Math.random() * 200 + 100 });
          await this.waitForNetworkIdle();
          return true;
        }
      }

      // Special case for DuckDuckGo "More Results" button
      if (await this.page.$('#more-results')) {
        await this.page.click('#more-results');
        await this.randomDelay(1000, 2000);
        return true;
      }

      return false;
    } catch (e) {
      return false;
    }
  }

  async clickSearchResult(pattern: string): Promise<boolean> {
    if (!this.page) throw new Error('Engine not initialized');
    try {
      const match = await this.page.evaluate((pattern: string) => {
        const links = Array.from(document.querySelectorAll('a'));
        const pl = pattern.toLowerCase();
        for (let i = 0; i < links.length; i++) {
          const href = (links[i] as HTMLAnchorElement).getAttribute('href') || '';
          if (href.startsWith('javascript:') || href.startsWith('mailto:') || href === '' || href === '#') continue;
          const rect = links[i].getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(links[i]).display !== 'none';
          if (!isVisible) continue;
          const text = links[i].textContent || '';
          const tl = text.toLowerCase();
          if (tl.includes('similar') || tl.includes('cached')) continue;
          if (href.toLowerCase().includes(pl) || tl.includes(pl)) {
            return { index: i, visible: true };
          }
        }
        return null;
      }, pattern);

      if (!match || !match.visible) return false;
      const links = await this.page.$$('a');
      const link = links[match.index];
      if (!link) return false;
      await this.page.evaluate((el: Element) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), link);
      await this.randomDelay(800, 2000);
      await link.click({ delay: Math.random() * 200 + 100 });
      return true;
    } catch (e) {
      logger.error(`Error in clickSearchResult: ${e}`);
      return false;
    }
  }

  async searchKeyword(keyword: string): Promise<void> {
    if (!this.page) throw new Error('Engine not initialized');
    this.navigationState = 'interacting';

    const searchInputSelectors = [
      'input[name="q"]', // Google, Bing
      'textarea[name="q"]', // Google modern
      '#search_form_input_homepage', // DuckDuckGo homepage
      '#search_form_input', // DuckDuckGo results
      'input[type="text"]', // Generic fallback
    ];

    let inputSet = false;
    for (const selector of searchInputSelectors) {
      try {
        const input = await this.page.waitForSelector(selector, { timeout: this.config.selectorTimeoutMs });
        if (input) {
          logger.debug(`Found search input with selector: ${selector}`);
          
          // Clear input first (cross-platform: Meta on macOS, Control elsewhere)
          await input.click();
          const modifier = selectKeyboardModifier(process.platform);
          await this.page.keyboard.down(modifier);
          await this.page.keyboard.press('a');
          await this.page.keyboard.up(modifier);
          await this.page.keyboard.press('Backspace');

          // Type like a human
          await input.type(keyword, { delay: Math.random() * 100 + 50 });
          await this.randomDelay(500, 1200);
          
          // Press Enter and wait for navigation
          const navPromise = this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: this.config.interactionTimeoutMs }).catch(() => {
            logger.debug('Search navigation timeout or already navigated');
          });
          await this.page.keyboard.press('Enter');
          await navPromise;
          
          await this.waitForNetworkIdle();
          this.navigationState = 'loaded';
          inputSet = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!inputSet) {
      throw new Error(`Search input not found with any selector for keyword: ${keyword}`);
    }
  }

  async handleConsentPopups(): Promise<boolean> {
    if (!this.page) throw new Error('Engine not initialized');
    
    logger.debug('Checking for consent popups...');
    
    const consentSelectors = [
      '#L2AGLb',
      '#bnp_btn_accept',
      '#adlt_set_save',
      '::-p-xpath(//button[@aria-label="Accept all"])',
      '::-p-xpath(//button[@aria-label="I agree"])',
      '::-p-xpath(//button[contains(., "Accept all")])',
      '::-p-xpath(//button[contains(., "I agree")])',
      '::-p-xpath(//button[contains(., "Accept cookies")])',
      '::-p-xpath(//button[contains(., "Reject all")])',
      '::-p-xpath(//div[@role="dialog"]//button[1])',
    ];

    try {
      // Short delay to allow popup to appear
      await new Promise(resolve => setTimeout(resolve, this.config.consentCheckDelayMs));

      for (const selector of consentSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            const isVisible = await element.evaluate((el: any) => {
              const style = window.getComputedStyle(el);
              return style && style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0;
            });
            if (isVisible) {
              logger.info('Consent popup detected, attempting to clear...', { selector });
              await (element as any).click();
              await new Promise(resolve => setTimeout(resolve, 1000));
              return true;
            }
          }
        } catch (e) {
          continue;
        }
      }
      
      logger.debug('No active consent popups detected.');
      return false;
    } catch (error) {
      logger.debug('Error while checking for consent popups', { error: (error as Error).message });
      return false;
    }
  }
}
