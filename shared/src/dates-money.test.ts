import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysBetween, dueDateFor, formatINR, parseISODate, round2, toISODate } from './finance.js';

const d = (s: string) => parseISODate(s);
const iso = (x: Date) => toISODate(x);

describe('date helpers', () => {
  it('parse/format round-trip without timezone drift, ignoring any time part', () => {
    expect(iso(d('2026-03-09'))).toBe('2026-03-09');
    expect(iso(d('2026-03-09T23:59:59.000Z'))).toBe('2026-03-09');
    expect(d('2026-03-09').getUTCHours()).toBe(0);
  });

  it('addDays crosses month and year ends', () => {
    expect(iso(addDays(d('2026-01-31'), 1))).toBe('2026-02-01');
    expect(iso(addDays(d('2026-12-31'), 1))).toBe('2027-01-01');
    expect(iso(addDays(d('2026-03-01'), -1))).toBe('2026-02-28');
  });

  it('addMonths clamps to the last day of shorter months, including leap years', () => {
    expect(iso(addMonths(d('2026-01-31'), 1))).toBe('2026-02-28');
    expect(iso(addMonths(d('2028-01-31'), 1))).toBe('2028-02-29');
    expect(iso(addMonths(d('2026-05-31'), 1))).toBe('2026-06-30');
    expect(iso(addMonths(d('2026-11-15'), 3))).toBe('2027-02-15');
    expect(iso(addMonths(d('2026-03-31'), -1))).toBe('2026-02-28');
  });

  it('monthly due dates are measured from the start, so a 31st start returns to the 31st', () => {
    const start = d('2026-01-31');
    expect([0, 1, 2, 3, 12].map((k) => iso(dueDateFor(start, 'MONTHLY', k)))).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2027-01-31',
    ]);
  });

  it('daily and weekly due dates', () => {
    expect(iso(dueDateFor(d('2026-02-28'), 'DAILY', 1))).toBe('2026-03-01');
    expect(iso(dueDateFor(d('2028-02-28'), 'DAILY', 1))).toBe('2028-02-29');
    expect(iso(dueDateFor(d('2026-12-29'), 'WEEKLY', 1))).toBe('2027-01-05');
  });

  it('daysBetween counts whole days, signed', () => {
    expect(daysBetween(d('2026-01-01'), d('2026-03-01'))).toBe(59);
    expect(daysBetween(d('2028-01-01'), d('2028-03-01'))).toBe(60);
    expect(daysBetween(d('2026-03-10'), d('2026-03-01'))).toBe(-9);
  });
});

describe('money helpers', () => {
  it('round2 rounds half-paise up despite binary floating point', () => {
    expect([1.005, 2.675, 0.125, 1.255, 10.235].map(round2)).toEqual([1.01, 2.68, 0.13, 1.26, 10.24]);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1234.5649)).toBe(1234.56);
  });

  it('formatINR uses Indian digit grouping', () => {
    expect(formatINR(123456.78)).toBe('₹1,23,456.78');
    expect(formatINR(0)).toBe('₹0.00');
  });
});
