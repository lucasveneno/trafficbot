/**
 * Zero-dependency 5-field cron evaluator.
 *
 * Supported syntax:
 *   *          any value
 *   n          exact value
 *   n,m,...    list
 *   n-m        range
 *   *\/n or n-m\/n  step
 *
 * Fields (left to right): minute hour day-of-month month day-of-week
 *
 * Limitations (intentional for simplicity):
 *   - No "last" (L), "nearest weekday" (W), or "#" modifiers
 *   - Month 1-12, weekday 0-7 (0 and 7 = Sunday)
 */

function parseField(expr: string, min: number, max: number): Set<number> {
  const result = new Set<number>();

  for (const part of expr.split(',')) {
    const stepSplit = part.split('/');
    const rangePart = stepSplit[0];
    const step = stepSplit[1] ? Number(stepSplit[1]) : 1;
    if (!Number.isInteger(step) || step < 1) throw new Error(`Invalid step: ${part}`);

    let lo: number, hi: number;
    if (rangePart === '*') { lo = min; hi = max; }
    else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-').map(Number);
      lo = a; hi = b;
    } else {
      lo = hi = Number(rangePart);
    }
    if (lo < min || hi > max || lo > hi) throw new Error(`Field out of range [${min}-${max}]: ${part}`);
    for (let v = lo; v <= hi; v += step) result.add(v);
  }

  return result;
}

export interface CronFields {
  minutes: Set<number>;
  hours: Set<number>;
  days: Set<number>;
  months: Set<number>;
  weekdays: Set<number>;
}

export function parseCron(expression: string): CronFields {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Expected 5 cron fields, got ${parts.length}: "${expression}"`);
  const [min, hr, dom, mon, dow] = parts;
  return {
    minutes:  parseField(min, 0, 59),
    hours:    parseField(hr,  0, 23),
    days:     parseField(dom, 1, 31),
    months:   parseField(mon, 1, 12),
    weekdays: parseField(dow, 0, 7),
  };
}

/** Returns true when the given Date matches the cron expression. */
export function cronMatches(fields: CronFields, date: Date): boolean {
  const wd = date.getDay(); // 0 = Sunday
  return (
    fields.minutes.has(date.getMinutes()) &&
    fields.hours.has(date.getHours()) &&
    fields.days.has(date.getDate()) &&
    fields.months.has(date.getMonth() + 1) && // cron months are 1-based
    (fields.weekdays.has(wd) || fields.weekdays.has(wd === 0 ? 7 : wd)) // 0 and 7 both = Sunday
  );
}

/** Return the next Date that matches the cron expression, starting from 1 minute after `from`. */
export function nextCronDate(expression: string, from: Date = new Date()): Date {
  const fields = parseCron(expression);
  // Start search from next whole minute
  const cursor = new Date(from);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  // Search up to 1 year out (525 960 minutes); avoids infinite loops on impossible expressions
  for (let i = 0; i < 525_960; i++) {
    if (cronMatches(fields, cursor)) return new Date(cursor);
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  throw new Error(`No matching date found for cron "${expression}" within 1 year`);
}

/** Validate that a 5-field cron expression is syntactically correct. */
export function validateCron(expression: string): void {
  parseCron(expression); // throws on invalid input
}
