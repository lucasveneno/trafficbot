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
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-features=IsolateOrigins,site-per-process',
      '--window-position=0,0',
      '--no-first-run',
      '--no-zygote',
      '--disable-blink-features=AutomationControlled',
    ];

    // On Linux and Windows, we usually need the sandbox flags or to disable them for stability
    if (process.platform === 'linux' || process.platform === 'win32') {
      args.push('--no-sandbox');
      args.push('--disable-setuid-sandbox');
    }

    if (options.proxy) {
      args.push(`--proxy-server=${options.proxy.server}`);
    }

    const launchOptions: any = {
      headless: options.headless === false ? false : 'new',
      args,
      ignoreDefaultArgs: ['--enable-automation'],
    };

    if (options.userDataDir) {
      launchOptions.userDataDir = options.userDataDir;
    }

    this.browser = await (puppeteer as any).launch(launchOptions);
    const pages = await this.browser!.pages();
    this.page = pages.length > 0 ? pages[0] : await this.browser!.newPage();

    if (options.userAgent) {
      await this.page.setUserAgent(options.userAgent);
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
}
