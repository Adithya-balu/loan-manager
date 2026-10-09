import { afterEach, describe, expect, it, vi } from 'vitest';
import { toISODate } from '@loan/shared';
import { today } from '../src/lib/dates.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('business "today" (#10)', () => {
  it('defaults to India time, so late-evening UTC is already tomorrow', () => {
    vi.useFakeTimers({ now: new Date('2026-10-08T20:00:00Z') }); // 01:30 IST on the 9th
    vi.stubEnv('APP_TIMEZONE', '');
    expect(toISODate(today())).toBe('2026-10-09');
  });

  it('respects APP_TIMEZONE', () => {
    vi.useFakeTimers({ now: new Date('2026-10-08T20:00:00Z') });
    vi.stubEnv('APP_TIMEZONE', 'UTC');
    expect(toISODate(today())).toBe('2026-10-08');
  });

  it('returns a UTC-midnight date', () => {
    expect(today().getUTCHours()).toBe(0);
  });
});
