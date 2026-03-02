import { BrowserEngine } from '../../domain/interfaces/BrowserEngine';
import { logger } from '../logging/logger';

export interface BehaviorOptions {
  intensity: 'low' | 'medium' | 'high';
}

export class BehaviorService {
  /**
   * Performs a random human-like action (scroll, move, or wait)
   */
  static async simulateRandomAction(
    engine: BrowserEngine, 
    viewport: { width: number, height: number },
    options: BehaviorOptions
  ): Promise<void> {
    const rand = Math.random();
    
    // Adjust probability based on intensity
    const thresholds = options.intensity === 'high' 
      ? { scroll: 0.4, move: 0.8 } 
      : options.intensity === 'medium' 
        ? { scroll: 0.3, move: 0.6 }
        : { scroll: 0.1, move: 0.3 };

    if (rand < thresholds.scroll) {
      await this.simulateScroll(engine);
    } else if (rand < thresholds.move) {
      await this.simulateMouseMove(engine, viewport);
    } else {
      // Micro-wait to simulate thinking
      await engine.wait(Math.floor(Math.random() * 2000) + 500);
    }
  }

  private static async simulateScroll(engine: BrowserEngine): Promise<void> {
    const direction = Math.random() > 0.3 ? 1 : -1; // Mostly scroll down
    const distance = Math.floor(Math.random() * 400) + 100;
    logger.debug(`Simulating scroll: ${direction * distance}px`);
    
    // Smooth scroll simulation via steps
    const steps = 5;
    const stepDistance = Math.floor(distance / steps);
    for (let i = 0; i < steps; i++) {
      await engine.scroll(0, direction * stepDistance);
      await engine.wait(Math.floor(Math.random() * 50) + 20);
    }
  }

  private static async simulateMouseMove(
    engine: BrowserEngine, 
    viewport: { width: number, height: number }
  ): Promise<void> {
    const targetX = Math.floor(Math.random() * viewport.width);
    const targetY = Math.floor(Math.random() * viewport.height);
    logger.debug(`Simulating mouse move to: ${targetX}, ${targetY}`);
    await engine.mouseMove(targetX, targetY);
  }
}
