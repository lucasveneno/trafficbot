import { PuppeteerStealthEngine } from './src/infrastructure/browser/PuppeteerStealthEngine';
import { FingerprintService } from './src/infrastructure/browser/FingerprintService';
import { logger } from './src/infrastructure/logging/logger';

async function verify() {
  const engine = new PuppeteerStealthEngine();
  const fingerprint = FingerprintService.generate();
  
  logger.info('Starting verification', { 
    ua: fingerprint.userAgent,
    platform: fingerprint.platform 
  });

  await engine.init({
    userAgent: fingerprint.userAgent,
    viewport: fingerprint.viewport,
    platform: fingerprint.platform,
    fingerprintScript: FingerprintService.getInjectionScript(fingerprint),
    headless: true // Run headless for verification
  });

  try {
    const url = 'https://bot.sannysoft.com/';
    logger.info(`Navigating to ${url}`);
    await engine.navigate(url);
    await engine.wait(5000); // Wait for tests to complete

    const screenshotPath = './verification_sannysoft.png';
    // We don't have a direct screenshot tool in BrowserEngine yet, 
    // but we can access the internal page if needed or just check for specific text.
    
    const results = await engine.evaluate(() => {
      const items = document.querySelectorAll('.table-striped tr');
      const data: Record<string, string> = {};
      items.forEach(item => {
        const key = item.querySelector('td:first-child')?.textContent?.trim();
        const val = item.querySelector('td:last-child')?.textContent?.trim();
        if (key && val) data[key] = val;
      });
      return data;
    });

    logger.info('Verification Results:', results);
    
    // Check for common red flags
    const failures = Object.entries(results).filter(([k, v]) => v.toLowerCase().includes('fail') || v.toLowerCase().includes('broken'));
    if (failures.length > 0) {
      logger.warn('Stealth Leaks Detected!', { failures });
    } else {
      logger.info('Stealth Verification Passed! No obvious leaks found.');
    }

  } catch (err) {
    logger.error('Verification failed', { err });
  } finally {
    // Note: engine.close() or similar would be good if implemented
    process.exit(0);
  }
}

verify();
