import { afterEach, describe, expect, it, vi } from 'vitest';
import { toLocalISODate, todayISO } from './format';

afterEach(() => vi.useRealTimers());

describe('local dates (#10)', () => {
  it('todayISO follows the local (IST) calendar, not UTC', () => {
    vi.useFakeTimers({ now: new Date('2026-10-08T20:00:00Z') }); // 01:30 IST on the 9th
    expect(todayISO()).toBe('2026-10-09');
  });

  it('toLocalISODate pads month and day', () => {
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
