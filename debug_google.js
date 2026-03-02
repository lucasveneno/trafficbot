const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  console.log('Navigating to Google...');
  await page.goto('https://www.google.com/search?q=stokiv');

  // Wait for results
  try {
    await page.waitForSelector('#search', { timeout: 10000 });
  } catch (e) {
    console.log('Search results container not found, taking screenshot anyway.');
  }

  // Handle consent if it blocks
  const consent = await page.$('#L2AGLb');
  if (consent) {
    console.log('Clicking consent...');
    await consent.click();
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('Taking screenshot...');
  const screenshotPath = '/Users/veneno/Projects/Scripts/trafficbot/google_debug.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Screenshot saved to ${screenshotPath}`);

  // List some links to see what we found
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map(a => ({
      href: a.href,
      text: a.innerText.substring(0, 50)
    })).filter(l => l.href.includes('stokiv'));
  });
  console.log('Links found:', JSON.stringify(links, null, 2));

  await browser.close();
})();
