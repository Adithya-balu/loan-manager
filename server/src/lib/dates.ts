import { parseISODate, toISODate } from '@loan/shared';

/**
 * Timezone the business runs in (IANA name). "Today", due dates and the
 * future-payment check all follow this, so a collection at 01:00 IST counts
 * for the Indian calendar day even though UTC is still on the previous one.
 */
export function businessTimeZone(): string {
  return process.env.APP_TIMEZONE || 'Asia/Kolkata';
}

/** Today's date in the business timezone, as UTC midnight (date-only semantics). */
export function today(): Date {
  // en-CA formats as yyyy-mm-dd.
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: businessTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parseISODate(local);
}

/** Strip a DateTime down to its UTC-midnight date. */
export function dateOnly(d: Date): Date {
  return parseISODate(toISODate(d));
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
