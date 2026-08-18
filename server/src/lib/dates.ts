import { parseISODate, toISODate } from '@loan/shared';

/** Today's date at UTC midnight (date-only semantics). */
export function today(): Date {
  return parseISODate(toISODate(new Date()));
}

/** Strip a DateTime down to its UTC-midnight date. */
export function dateOnly(d: Date): Date {
  return parseISODate(toISODate(d));
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
