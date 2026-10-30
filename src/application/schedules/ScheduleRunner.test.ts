import { ScheduleRunner } from './ScheduleRunner';
import { ScheduleStore } from './ScheduleStore';
test('stop before initial tick cancels all scheduling and permits restart', () => {
  jest.useFakeTimers();
  const store = { list: jest.fn(async () => []) } as unknown as ScheduleStore;
  const runner = new ScheduleRunner({ snapshot: jest.fn(), submit: jest.fn() }, store);
  runner.start(); runner.start(); expect(jest.getTimerCount()).toBe(1);
  runner.stop(); jest.advanceTimersByTime(120000);
  expect(store.list).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
  runner.start(); expect(jest.getTimerCount()).toBe(1); runner.stop(); jest.useRealTimers();
});
