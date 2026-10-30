import type { BrowserProfile } from '../../infrastructure/browser/profile/BrowserProfile';

export interface BrowserOptions {
  deviceProfile?: string;
  proxyLocationEndpoint?: string;
  grantGeolocation?: boolean;
  allowedOrigin?: string;
  searchOrigins?: string[];
  navigationTimeoutMs?: number;
  headless?: boolean | 'new';
  userDataDir?: string;
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
}

export interface BrowserEngine {
  init(options: BrowserOptions): Promise<void>;
  getProfile(): BrowserProfile;
  captureFailureScreenshot?(): Promise<Uint8Array | undefined>;
  navigate(url: string): Promise<void>;
  navigationResult(allowFailure?: boolean): { status: number; finalUrl: string };
  wait(ms: number): Promise<void>;
  evaluate<T>(fn: (...args: any[]) => T, ...args: any[]): Promise<T>;
  scroll(deltaX: number, deltaY: number): Promise<void>;
  mouseMove(x: number, y: number): Promise<void>;
  click(x: number, y: number): Promise<void>;
  pressKey(key: string): Promise<void>;
  close(): Promise<void>;
  setExtraHeaders(headers: Record<string, string>): Promise<void>;
  setGeolocation(latitude: number, longitude: number): Promise<void>;
  waitForNetworkIdle(): Promise<void>;
  randomDelay(min: number, max: number): Promise<void>;
  clickLinkByHref(href: string): Promise<boolean>;
  clickLinkContainingHref(partialHref: string): Promise<boolean>;
  clickLinkByText(text: string): Promise<boolean>;
  clickNextSearchPage(): Promise<boolean>;
  clickSearchResult(pattern: string): Promise<boolean>;
  searchKeyword(keyword: string): Promise<void>;
  handleConsentPopups(): Promise<boolean>;
}
