import { BrowserEngine } from '../../domain/interfaces/BrowserEngine';
import { logger } from '../logging/logger';

export interface RandomSource {
  /** Returns a float in [0, 1) */
  next(): number;
}

export const defaultRandom: RandomSource = { next: () => Math.random() };

export interface BehaviorOptions {
  intensity: 'low' | 'medium' | 'high';
  deadlineMs?: number;
  signal?: AbortSignal;
}

export class BehaviorService {
  static lastPosition = { x: 640, y: 360 };

  /**
   * Performs a random human-like action (scroll, move, hover, or wait)
   */
  static async simulateRandomAction(
    engine: BrowserEngine,
    viewport: { width: number; height: number },
    options: BehaviorOptions,
    rng: RandomSource = defaultRandom
  ): Promise<void> {
    const remaining = () => options.deadlineMs === undefined ? Number.POSITIVE_INFINITY : Math.max(0, options.deadlineMs - Date.now());
    if (remaining() <= 0) return;
    if (options.signal?.aborted) return;

    const rand = rng.next();

    // Adjust probability based on intensity
    const thresholds = options.intensity === 'high'
      ? { scroll: 0.40, move: 0.65, hover: 0.75, pause: 0.92 }
      : options.intensity === 'medium'
        ? { scroll: 0.30, move: 0.55, hover: 0.65, pause: 0.85 }
        : { scroll: 0.15, move: 0.35, hover: 0.45, pause: 0.80 };

    if (rand < thresholds.scroll) {
      if (options.signal?.aborted) return;
      await this.simulateScroll(engine, options.deadlineMs, rng);
    } else if (rand < thresholds.move) {
      if (options.signal?.aborted) return;
      const target = { x: Math.floor(rng.next() * viewport.width), y: Math.floor(rng.next() * viewport.height) };
      await this.simulateBezierMove(engine, BehaviorService.lastPosition, target, 24, rng, options.signal);
      BehaviorService.lastPosition = target;
    } else if (rand < thresholds.hover) {
      if (options.signal?.aborted) return;
      // hover: move to a position then dwell
      const target = { x: Math.floor(rng.next() * viewport.width), y: Math.floor(rng.next() * viewport.height) };
      await this.simulateBezierMove(engine, BehaviorService.lastPosition, target, 24, rng, options.signal);
      BehaviorService.lastPosition = target;
      const dwell = Math.min(Math.floor(rng.next() * 1500) + 500, remaining());
      if (dwell > 0) await engine.wait(dwell);
    } else if (rand < thresholds.pause) {
      if (options.signal?.aborted) return;
      // Simulate "Reading" - long pause with micro-jitters
      logger.debug('Simulating reading pause...');
      const pauseDuration = Math.min(Math.floor(rng.next() * 3000) + 2000, remaining());
      const start = Date.now();
      while (Date.now() - start < pauseDuration) {
        if (options.signal?.aborted) return;
        // Occasional tiny mouse nudge while reading
        if (rng.next() > 0.8) {
          const nudgeX = Math.floor(rng.next() * 10) - 5;
          const nudgeY = Math.floor(rng.next() * 10) - 5;
          await engine.mouseMove(viewport.width / 2 + nudgeX, viewport.height / 2 + nudgeY);
        }
        const wait = Math.min(500, remaining(), pauseDuration - (Date.now() - start));
        if (wait <= 0) break;
        await engine.wait(wait);
      }
    } else {
      if (options.signal?.aborted) return;
      // Micro-wait
      const wait = Math.min(Math.floor(rng.next() * 500) + 100, remaining());
      if (wait > 0) await engine.wait(wait);
    }
  }

  /**
   * Types text with human-like timing, including occasional thinking pauses.
   */
  static async humanType(
    keyPresser: (key: string, delay: number) => Promise<void>,
    text: string,
    rng: RandomSource = defaultRandom,
    signal?: AbortSignal
  ): Promise<void> {
    for (const char of text) {
      if (signal?.aborted) return;
      // Occasional thinking pause before a character
      if (rng.next() < 0.05) {
        const thinkMs = Math.floor(rng.next() * 1200) + 800; // 800–2000ms
        await new Promise(resolve => setTimeout(resolve, thinkMs));
      }
      // Slower on spaces and punctuation
      const isPunctuation = /[.,;:!? ]/.test(char);
      const delay = isPunctuation
        ? Math.floor(rng.next() * 200) + 150 // 150–350ms
        : Math.floor(rng.next() * 100) + 60;  // 60–160ms
      await keyPresser(char, delay);
    }
  }

  private static async simulateScroll(engine: BrowserEngine, deadlineMs?: number, rng: RandomSource = defaultRandom): Promise<void> {
    const direction = rng.next() > 0.3 ? 1 : -1; // Mostly scroll down
    const distance = Math.floor(rng.next() * 400) + 100;
    logger.debug(`Simulating scroll: ${direction * distance}px`);

    // Smooth scroll simulation via steps
    const steps = 5;
    const stepDistance = Math.floor(distance / steps);
    for (let i = 0; i < steps; i++) {
      const remaining = deadlineMs === undefined ? Number.POSITIVE_INFINITY : deadlineMs - Date.now();
      if (remaining <= 0) break;
      await engine.scroll(0, direction * stepDistance);
      await engine.wait(Math.min(Math.floor(rng.next() * 50) + 20, remaining));
    }
  }

  /**
   * Moves the mouse from `from` to `to` along a cubic Bezier curve with two random
   * control points, yielding human-like curved motion.
   */
  private static async simulateBezierMove(
    engine: BrowserEngine,
    from: { x: number; y: number },
    to: { x: number; y: number },
    steps = 24,
    rng: RandomSource = defaultRandom,
    signal?: AbortSignal
  ): Promise<void> {
    // Midpoint
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;

    // Random control points within ±30% of 1280×720 from the midpoint
    const jitterX = 1280 * 0.30;
    const jitterY = 720 * 0.30;
    const p1 = {
      x: mx + (rng.next() * 2 - 1) * jitterX,
      y: my + (rng.next() * 2 - 1) * jitterY,
    };
    const p2 = {
      x: mx + (rng.next() * 2 - 1) * jitterX,
      y: my + (rng.next() * 2 - 1) * jitterY,
    };

    logger.debug(`Bezier move: (${from.x},${from.y}) → (${to.x},${to.y})`);

    for (let i = 1; i <= steps; i++) {
      if (signal?.aborted) return;
      const t = i / steps;
      const u = 1 - t;
      // Cubic Bezier: B(t) = u³P0 + 3u²tP1 + 3ut²P2 + t³P3
      const x = Math.round(u * u * u * from.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * to.x);
      const y = Math.round(u * u * u * from.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * to.y);
      await engine.mouseMove(x, y);
      const stepDelay = Math.floor(rng.next() * 11) + 5; // 5–15ms
      await engine.wait(stepDelay);
    }
  }
}
