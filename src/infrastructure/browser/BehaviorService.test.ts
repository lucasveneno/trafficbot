import { BehaviorService, RandomSource, defaultRandom } from './BehaviorService';
import { selectKeyboardModifier } from './PuppeteerStealthEngine';
import { BrowserEngine } from '../../domain/interfaces/BrowserEngine';

// ─── Mock engine factory ──────────────────────────────────────────────────────

function makeMockEngine() {
  const moves: Array<{ x: number; y: number }> = [];
  const scrolls: Array<{ dx: number; dy: number }> = [];
  const engine = {
    mouseMove: jest.fn(async (x: number, y: number) => { moves.push({ x, y }); }),
    wait: jest.fn(async (_ms: number) => {}),
    scroll: jest.fn(async (dx: number, dy: number) => { scrolls.push({ dx, dy }); }),
    // Remaining BrowserEngine methods — no-op stubs
    init: jest.fn(async () => {}),
    getProfile: jest.fn(() => { throw new Error('stub'); }),
    navigate: jest.fn(async () => {}),
    navigationResult: jest.fn(() => ({ status: 200, finalUrl: '' })),
    evaluate: jest.fn(async () => undefined),
    click: jest.fn(async () => {}),
    close: jest.fn(async () => {}),
    setExtraHeaders: jest.fn(async () => {}),
    setGeolocation: jest.fn(async () => {}),
    waitForNetworkIdle: jest.fn(async () => {}),
    randomDelay: jest.fn(async () => {}),
    clickLinkByHref: jest.fn(async () => false),
    clickLinkContainingHref: jest.fn(async () => false),
    clickLinkByText: jest.fn(async () => false),
    clickNextSearchPage: jest.fn(async () => false),
    clickSearchResult: jest.fn(async () => false),
    searchKeyword: jest.fn(async () => {}),
    handleConsentPopups: jest.fn(async () => false),
  } as unknown as BrowserEngine;
  return { engine, moves, scrolls };
}

/** RNG that always returns a fixed constant value */
function constRng(value: number): RandomSource {
  return { next: () => value };
}

/**
 * RNG that returns a fixed sequence, cycling back to the start when exhausted.
 */
function seqRng(values: number[]): RandomSource {
  let i = 0;
  return { next: () => values[i++ % values.length] };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const viewport = { width: 1280, height: 720 };

async function triggerBezierMove(engine: BrowserEngine, from: { x: number; y: number }, to: { x: number; y: number }) {
  const targetXFrac = to.x / viewport.width;
  const targetYFrac = to.y / viewport.height;
  const values = [0.5, targetXFrac, targetYFrac, ...Array(200).fill(0.5)];
  const rng = seqRng(values);

  BehaviorService.lastPosition = from;
  await BehaviorService.simulateRandomAction(engine, viewport, { intensity: 'high' }, rng);
}

// ─── Bezier movement invariants ───────────────────────────────────────────────

describe('BehaviorService – Bezier movement invariants', () => {
  const from = { x: 100, y: 100 };
  const to = { x: 150, y: 150 };

  test('Bezier: starts near the from position', async () => {
    const { engine, moves } = makeMockEngine();
    await (BehaviorService as any).simulateBezierMove(engine, from, to, 24, constRng(0.5));
    expect(moves.length).toBeGreaterThan(0);
    const first = moves[0];
    const distFromStart = Math.hypot(first.x - from.x, first.y - from.y);
    expect(distFromStart).toBeLessThanOrEqual(5);
  });

  test('Bezier: ends near the requested target', async () => {
    const { engine, moves } = makeMockEngine();
    await (BehaviorService as any).simulateBezierMove(engine, from, to, 24, constRng(0.5));
    const last = moves[moves.length - 1];
    expect(Math.abs(last.x - to.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(last.y - to.y)).toBeLessThanOrEqual(2);
  });

  test('Bezier: all intermediate points are finite', async () => {
    const { engine, moves } = makeMockEngine();
    await (BehaviorService as any).simulateBezierMove(engine, from, to, 24, constRng(0.5));
    for (const { x, y } of moves) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });

  test('Bezier: all intermediate points are non-negative', async () => {
    const { engine, moves } = makeMockEngine();
    await (BehaviorService as any).simulateBezierMove(engine, from, to, 24, constRng(0.5));
    for (const { x, y } of moves) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
    }
  });

  test('Bezier: seeded rng produces deterministic path', async () => {
    const mock1 = makeMockEngine();
    const mock2 = makeMockEngine();
    const f = { x: 50, y: 50 };
    const t = { x: 600, y: 400 };

    await (BehaviorService as any).simulateBezierMove(mock1.engine, f, t, 24, constRng(0.5));
    await (BehaviorService as any).simulateBezierMove(mock2.engine, f, t, 24, constRng(0.5));

    expect(mock1.moves).toEqual(mock2.moves);
  });

  test('Bezier: stops mid-path when signal is aborted', async () => {
    const { engine, moves } = makeMockEngine();
    const controller = new AbortController();
    let moveCount = 0;

    (engine.mouseMove as jest.Mock).mockImplementation(async (x: number, y: number) => {
      moves.push({ x, y });
      moveCount++;
      if (moveCount >= 3) controller.abort();
    });

    const f = { x: 0, y: 0 };
    const t = { x: 1000, y: 600 };

    await (BehaviorService as any).simulateBezierMove(engine, f, t, 24, constRng(0.5), controller.signal);
    expect(moves.length).toBeLessThan(24);
  });

  test('updates lastPosition after completion', async () => {
    const mock = makeMockEngine();
    const f = { x: 10, y: 10 };
    const t = { x: 800, y: 500 };
    await triggerBezierMove(mock.engine, f, t);
    expect(BehaviorService.lastPosition.x).toBe(t.x);
    expect(BehaviorService.lastPosition.y).toBe(t.y);
  });
});

// ─── humanType timing ─────────────────────────────────────────────────────────

describe('BehaviorService – humanType', () => {
  function makeKeyPresser() {
    const calls: Array<{ key: string; delay: number }> = [];
    const fn = jest.fn(async (key: string, delay: number) => { calls.push({ key, delay }); });
    return { fn, calls };
  }

  test('humanType: calls keyPresser for each character', async () => {
    const { fn } = makeKeyPresser();
    await BehaviorService.humanType(fn, 'hello', constRng(0.5));
    expect(fn).toHaveBeenCalledTimes(5);
  });

  test('humanType: empty string causes zero keypresses', async () => {
    const { fn } = makeKeyPresser();
    await BehaviorService.humanType(fn, '', constRng(0.5));
    expect(fn).toHaveBeenCalledTimes(0);
  });

  test('humanType: aborts when signal is already aborted', async () => {
    const { fn } = makeKeyPresser();
    await BehaviorService.humanType(fn, 'hello', constRng(0.5), AbortSignal.abort());
    expect(fn).toHaveBeenCalledTimes(0);
  });

  test('humanType: aborts mid-string when signal fires after 2 chars', async () => {
    const calls: string[] = [];
    const controller = new AbortController();
    let callCount = 0;

    const presser = jest.fn(async (key: string, _delay: number) => {
      calls.push(key);
      callCount++;
      if (callCount >= 2) {
        controller.abort();
      }
    });

    await BehaviorService.humanType(presser, 'hello world', constRng(0.5), controller.signal);
    expect(calls.length).toBeLessThan(11);
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  test('humanType: punctuation receives longer delay (≥150ms)', async () => {
    const { calls } = makeKeyPresser();
    const presser = jest.fn(async (key: string, delay: number) => { calls.push({ key, delay }); });
    // First call (pause check): 0.5 (>= 0.05, no thinking pause)
    // Second call (delay calc): 0 (floor(0 * 200) + 150 = 150ms)
    await BehaviorService.humanType(presser, ',', seqRng([0.5, 0]));
    expect(calls).toHaveLength(1);
    expect(calls[0].delay).toBeGreaterThanOrEqual(150);
  });

  test('humanType: normal char receives standard delay range (≥60ms)', async () => {
    const { calls } = makeKeyPresser();
    const presser = jest.fn(async (key: string, delay: number) => { calls.push({ key, delay }); });
    // First call (pause check): 0.5 (>= 0.05, no thinking pause)
    // Second call (delay calc): 0 (floor(0 * 100) + 60 = 60ms)
    await BehaviorService.humanType(presser, 'a', seqRng([0.5, 0]));
    expect(calls).toHaveLength(1);
    expect(calls[0].delay).toBeGreaterThanOrEqual(60);
  });
});

// ─── simulateRandomAction with aborted signal ─────────────────────────────────

describe('BehaviorService – simulateRandomAction cancellation', () => {
  test('simulateRandomAction: returns immediately when signal is aborted', async () => {
    const { engine, moves, scrolls } = makeMockEngine();
    await BehaviorService.simulateRandomAction(
      engine,
      viewport,
      { intensity: 'high', signal: AbortSignal.abort() },
      defaultRandom
    );
    expect(moves).toHaveLength(0);
    expect(scrolls).toHaveLength(0);
  });
});

// ─── Platform keyboard shortcut selection ─────────────────────────────────────

describe('selectKeyboardModifier', () => {
  test('macOS uses Meta modifier', () => {
    expect(selectKeyboardModifier('darwin')).toBe('Meta');
  });

  test('Windows uses Control modifier', () => {
    expect(selectKeyboardModifier('win32')).toBe('Control');
  });

  test('Linux uses Control modifier', () => {
    expect(selectKeyboardModifier('linux')).toBe('Control');
  });
});
