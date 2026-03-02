import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import { BrowserEngine, BrowserOptions } from '../../domain/interfaces/BrowserEngine';
import { logger } from '../logging/logger';

puppeteer.use(StealthPlugin());

export class PuppeteerStealthEngine implements BrowserEngine {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async init(options: BrowserOptions): Promise<void> {
    const args = [
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--window-position=0,0',
      '--no-first-run',
      '--no-zygote',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-default-browser-check',
    ];

    // On Linux and Windows, we usually need the sandbox flags or to disable them for stability
    if (process.platform === 'linux' || process.platform === 'win32') {
      args.push('--no-sandbox');
      args.push('--disable-setuid-sandbox');
      args.push('--disable-dev-shm-usage');
      args.push('--disable-accelerated-2d-canvas');
      args.push('--disable-gpu');
    }

    if (options.proxy) {
      args.push(`--proxy-server=${options.proxy.server}`);
    }

    const launchOptions: any = {
      headless: options.headless === false ? false : 'new',
      args,
      ignoreDefaultArgs: ['--enable-automation'],
      defaultViewport: options.viewport || { width: 1280, height: 720 },
    };

    if (options.userDataDir) {
      launchOptions.userDataDir = options.userDataDir;
    }

    this.browser = await (puppeteer as any).launch(launchOptions);
    const pages = await this.browser!.pages();
    this.page = pages.length > 0 ? pages[0] : await this.browser!.newPage();

    if (options.userAgent) {
      await this.page.setUserAgent(options.userAgent);
      
      // Reinforce Client Hints (Sec-CH-UA)
      const chromeMatch = options.userAgent.match(/Chrome\/(\d+)/);
      if (chromeMatch) {
        const majorVersion = chromeMatch[1];
        const isMobile = options.userAgent.includes('Mobile');
        const platform = options.platform === 'MacIntel' ? 'macOS' : 
                         options.platform === 'Win32' ? 'Windows' : 'Linux';

        await this.page.setExtraHTTPHeaders({
          'sec-ch-ua': `"Not(A:Brand";v="99", "Google Chrome";v="${majorVersion}", "Chromium";v="${majorVersion}"`,
          'sec-ch-ua-mobile': isMobile ? '?1' : '?0',
          'sec-ch-ua-platform': `"${platform}"`,
        });
      }
    }

    if (options.viewport) {
      await this.page.setViewport(options.viewport);
    }

    if (options.proxy?.username && options.proxy?.password) {
      await this.page.authenticate({
        username: options.proxy.username,
        password: options.proxy.password,
      });
    }

    await this.page.evaluateOnNewDocument(options.fingerprintScript!);

    logger.debug('Puppeteer Stealth initialized with advanced fingerprint', { 
      userAgent: options.userAgent,
      platform: options.platform 
    });
  }

  async navigate(url: string): Promise<void> {
    if (!this.page) throw new Error('Engine not initialized');
    await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  }

  async wait(ms: number): Promise<void> {
    if (!this.page) throw new Error('Engine not initialized');
    await new Promise(resolve => setTimeout(resolve, ms));
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

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async setExtraHeaders(headers: Record<string, string>): Promise<void> {
    if (!this.page) throw new Error('Engine not initialized');
    await this.page.setExtraHTTPHeaders(headers);
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
      await this.page.waitForNetworkIdle({ idleTime: 1000, timeout: 15000 });
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
      // Common selectors for "Next" buttons
      const nextSelectors = [
        'a#pnnext', // Google
        'a.sb_pagN', // Bing
        '#more-results', // DuckDuckGo
        'a.next', // Generic
        'a[aria-label="Next page"]' // Standard ARIA
      ];

      for (const selector of nextSelectors) {
        const nextButton = await this.page.$(selector);
        if (nextButton) {
          // Robust click
          await this.page.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), nextButton);
          await this.randomDelay(1000, 2000);
          await nextButton.click({ delay: Math.random() * 200 + 100 });
          await this.waitForNetworkIdle();
          return true;
        }
      }

      // Fallback: Try searching for "Next" text in links
      return await this.clickLinkByText('Next');
    } catch (e) {
      return false;
    }
  }

  async searchKeyword(keyword: string): Promise<void> {
    if (!this.page) throw new Error('Engine not initialized');
    
    try {
      // Find search input (Google: [name="q"], Bing: [name="q"], DDG: [name="q"] or #search_form_input_homepage)
      const inputSelector = 'input[name="q"], textarea[name="q"], #search_form_input_homepage, #search_form_input';
      await this.page.waitForSelector(inputSelector, { timeout: 10000 });
      
      // Click into search box
      await this.page.click(inputSelector);
      await this.randomDelay(500, 1000);
      
      // Type like a human
      for (const char of keyword) {
        await this.page.type(inputSelector, char, { delay: Math.random() * 100 + 50 });
      }
      
      await this.randomDelay(500, 1200);
      
      // Press Enter and wait for navigation
      const navPromise = this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await this.page.keyboard.press('Enter');
      await navPromise;
      
      await this.waitForNetworkIdle();
    } catch (e: any) {
      // Fallback: If we can't find the input or fail typing, just navigate to the result URL
      // This is handled by the caller if this throws, but we want to be robust
      throw new Error(`Failed to simulate human search: ${e.message}`);
    }
  }

  async handleConsentPopups(): Promise<boolean> {
    if (!this.page) throw new Error('Engine not initialized');
    
    logger.debug('Checking for consent popups...');
    
    const consentSelectors = [
      // Google
      'button[aria-label="Accept all"]',
      'button[aria-label="I agree"]',
      '#L2AGLb', // Google "Accept all" ID
      'button:contains("Accept all")',
      // Bing
      '#bnp_btn_accept',
      'button#bnp_btn_accept',
      '#adlt_set_save',
      // Generic XPath for buttons containing specific text
      '//button[contains(translate(., "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "accept all")]',
      '//button[contains(translate(., "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "i agree")]',
      '//button[contains(translate(., "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "agree")]',
      '//button[contains(translate(., "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "accept cookies")]'
    ];

    try {
      // Short delay to allow popup to appear
      await new Promise(resolve => setTimeout(resolve, 2000));

      for (const selector of consentSelectors) {
        let element;
        if (selector.startsWith('//')) {
          const handles = await this.page.$$(`::-p-xpath(${selector})`);
          if (handles.length > 0) element = handles[0];
        } else if (selector.includes(':contains')) {
          const text = selector.match(/:contains\("(.+)"\)/)?.[1];
          if (text) {
             const handles = await this.page.$$(`::-p-xpath(//button[contains(., "${text}")])`);
             if (handles.length > 0) element = handles[0];
          }
        } else {
          element = await this.page.$(selector);
        }

        if (element) {
          const isVisible = await element.evaluate((el: any) => {
            const style = window.getComputedStyle(el);
            return style && style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0;
          });

          if (isVisible) {
            logger.info('Consent popup detected, attempting to clear...', { selector });
            await (element as any).click();
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for it to close
            return true;
          }
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
