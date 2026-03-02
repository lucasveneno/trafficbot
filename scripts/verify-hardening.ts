import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { FingerprintService } from '../src/infrastructure/browser/FingerprintService';

puppeteer.use(StealthPlugin());

async function verifyHardening() {
  console.log('--- Verifying Advanced Fingerprint Hardening ---');
  
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox']
  });
  
  const page = await browser.newPage();
  const fingerprint = FingerprintService.generate();
  const injectionScript = FingerprintService.getInjectionScript(fingerprint);
  
  await page.evaluateOnNewDocument(injectionScript);
  await page.goto('about:blank');

  // Verify Audio Masking
  const audioResult = await page.evaluate(async () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buffer = audioCtx.createBuffer(1, 1000, 44100);
      const data = buffer.getChannelData(0);
      return data[data.length - 1]; // Should be perturbed
    } catch (e) {
      return (e as Error).message;
    }
  });

  // Verify Font/Offset Randomized Measurements
  const fontResult = await page.evaluate(() => {
    const div = document.createElement('div');
    div.style.width = '100px';
    div.style.height = '100px';
    div.style.visibility = 'hidden';
    document.body.appendChild(div);
    const w = div.offsetWidth;
    const h = div.offsetHeight;
    document.body.removeChild(div);
    return { w, h }; // Should have fractional noise
  });

  console.log('Audio Tail Value (should be perturbed if > 0):', audioResult);
  console.log('Div Width (should be slightly > 100):', fontResult.w);
  console.log('Div Height (should be slightly > 100):', fontResult.h);

  await browser.close();
  
  if (fontResult.w > 100 && fontResult.h > 100) {
    console.log('SUCCESS: Font/Geometry measurements are randomized.');
  } else {
    console.error('FAILURE: Font/Geometry measurements are NOT randomized.');
  }
}

verifyHardening().catch(console.error);
