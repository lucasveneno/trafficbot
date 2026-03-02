import { PuppeteerStealthEngine } from '../src/infrastructure/browser/PuppeteerStealthEngine';
import { FingerprintService } from '../src/infrastructure/browser/FingerprintService';
import { Session } from '../src/domain/entities/Session';
import { TrafficOrchestrator } from '../src/application/traffic/TrafficOrchestrator';

async function testFingerprint() {
  const fingerprint = FingerprintService.generate();
  console.log('Testing Fingerprint:', {
    ua: fingerprint.userAgent,
    platform: fingerprint.platform,
    viewport: fingerprint.viewport
  });

  const engine = new PuppeteerStealthEngine();
  const session = new Session({
    id: 'test-fingerprint',
    url: 'https://bot.sannysoft.com/', // Excellent stealth test site
    userAgent: fingerprint.userAgent,
    viewport: fingerprint.viewport,
    durationMs: 30000
  });

  const orchestrator = new TrafficOrchestrator(engine);
  
  await orchestrator.run(session, {
    headless: false, // We want to see it
    platform: fingerprint.platform,
    fingerprintScript: FingerprintService.getInjectionScript(fingerprint)
  });
}

testFingerprint().catch(console.error);
