import type {
  LoanFrequency,
  ScheduleParams,
  ScheduleRow,
  ScheduleSummary,
  RiskInputs,
  RiskResult,
  RiskBand,
} from './types.js';

/** Number of periods in a year for each frequency (used to convert annual rate & tenure). */
export function periodsPerYear(freq: LoanFrequency): number {
  switch (freq) {
    case 'DAILY':
      return 365;
    case 'WEEKLY':
      return 52;
    case 'MONTHLY':
      return 12;
  }
}

/** Round to 2 decimal places (paise-accurate money rounding). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Format a Date as an ISO yyyy-mm-dd string (date only, timezone-safe). */
export function toISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Parse a yyyy-mm-dd string into a UTC Date (avoids TZ drift). */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('T')[0].split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Add whole months, clamping to the last valid day of the target month. */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const targetMonth = d.getUTCMonth() + months;
  const targetYear = d.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normMonth = ((targetMonth % 12) + 12) % 12;
  const day = d.getUTCDate();
  const lastDay = new Date(Date.UTC(targetYear, normMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, normMonth, Math.min(day, lastDay)));
}

/** Due date of installment `index` (0-based) given the first installment date. */
export function dueDateFor(startDate: Date, freq: LoanFrequency, index: number): Date {
  switch (freq) {
    case 'DAILY':
      return addDays(startDate, index);
    case 'WEEKLY':
      return addDays(startDate, index * 7);
    case 'MONTHLY':
      return addMonths(startDate, index);
  }
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Generate a full repayment schedule.
 *
 * FLAT:      Interest = P x R x T (T in years). Each installment carries an equal
 *            slice of principal and an equal slice of interest.
 * REDUCING:  Equal EMI computed on the per-period rate; interest accrues on the
 *            outstanding balance and the remainder reduces principal.
 *
 * Rounding is done to paise; the final installment absorbs any residual so the
 * totals reconcile exactly.
 */
export function generateSchedule(params: ScheduleParams): ScheduleSummary {
  const { principal, annualRatePct, frequency, installments, method } = params;
  const n = Math.max(1, Math.floor(installments));
  const start = parseISODate(params.startDate);
  const rows: ScheduleRow[] = [];

  if (method === 'FLAT') {
    const years = n / periodsPerYear(frequency);
    const totalInterest = round2(principal * (annualRatePct / 100) * years);
    const perPrincipal = round2(principal / n);
    const perInterest = round2(totalInterest / n);
    let principalRemaining = principal;
    let interestRemaining = totalInterest;

    for (let i = 0; i < n; i++) {
      const isLast = i === n - 1;
      const p = isLast ? round2(principalRemaining) : perPrincipal;
      const interest = isLast ? round2(interestRemaining) : perInterest;
      const opening = round2(principalRemaining);
      principalRemaining = round2(principalRemaining - p);
      interestRemaining = round2(interestRemaining - interest);
      rows.push({
        sequence: i + 1,
        dueDate: toISODate(dueDateFor(start, frequency, i)),
        openingBalance: opening,
        principalComponent: p,
        interestComponent: interest,
        amountDue: round2(p + interest),
        closingBalance: round2(principalRemaining),
      });
    }
    return {
      rows,
      totalPrincipal: principal,
      totalInterest,
      totalPayable: round2(principal + totalInterest),
      installmentAmount: rows.length ? rows[0].amountDue : 0,
    };
  }

  // REDUCING balance (EMI)
  const i = annualRatePct / 100 / periodsPerYear(frequency);
  let emi: number;
  if (i === 0) {
    emi = round2(principal / n);
  } else {
    const factor = Math.pow(1 + i, n);
    emi = round2((principal * i * factor) / (factor - 1));
  }

  let balance = principal;
  let totalInterest = 0;
  for (let k = 0; k < n; k++) {
    const isLast = k === n - 1;
    const opening = round2(balance);
    const interest = round2(balance * i);
    let principalComponent = round2(emi - interest);
    let amountDue = emi;
    if (isLast) {
      // Final installment clears whatever is left, absorbing rounding drift.
      principalComponent = round2(balance);
      amountDue = round2(principalComponent + interest);
    }
    balance = round2(balance - principalComponent);
    totalInterest = round2(totalInterest + interest);
    rows.push({
      sequence: k + 1,
      dueDate: toISODate(dueDateFor(start, frequency, k)),
      openingBalance: opening,
      principalComponent,
      interestComponent: interest,
      amountDue,
      closingBalance: round2(balance),
    });
  }

  return {
    rows,
    totalPrincipal: principal,
    totalInterest,
    totalPayable: round2(principal + totalInterest),
    installmentAmount: emi,
  };
}

/**
 * Re-amortize the remaining installments after an unpaid amount has been
 * capitalized into the outstanding principal.
 *
 * Policy (per product decisions):
 *  - keep the SAME number of remaining installments (original end date preserved),
 *  - recompute interest on the new, higher outstanding for the remaining term.
 *
 * `newOutstanding` = existing outstanding principal + amount being capitalized.
 * `firstDueDate`   = due date of the first still-open installment (ISO string).
 */
export function reamortizeRemaining(args: {
  newOutstanding: number;
  remainingInstallments: number;
  annualRatePct: number;
  frequency: LoanFrequency;
  firstDueDate: string;
  method: 'FLAT' | 'REDUCING';
}): ScheduleSummary {
  return generateSchedule({
    principal: round2(args.newOutstanding),
    annualRatePct: args.annualRatePct,
    frequency: args.frequency,
    installments: args.remainingInstallments,
    startDate: args.firstDueDate,
    method: args.method,
  });
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function riskBandFor(score: number | null): RiskBand {
  if (score === null) return 'UNKNOWN';
  if (score >= 67) return 'LOW';
  if (score >= 34) return 'MEDIUM';
  return 'HIGH';
}

/**
 * Compute a customer's risk score from repayment behaviour.
 * Score is 0..100 where HIGHER = SAFER / more reliable.
 * Returns null (UNKNOWN) when the customer has no matured installments yet.
 *
 * Weights: on-time rate 40%, defaults 25%, avg delay 15%,
 *          partial frequency 10%, overdue exposure 10%.
 */
export function computeRisk(inputs: RiskInputs): RiskResult {
  if (inputs.matured <= 0) {
    return { score: null, band: 'UNKNOWN' };
  }
  const matured = inputs.matured;
  const onTimeRate = clamp01(inputs.paidOnTime / matured);
  const defaultScore = clamp01(1 - inputs.defaulted / matured);
  const delayScore = clamp01(1 - inputs.avgDelayDays / 30);
  const partialScore = clamp01(1 - inputs.partial / matured);
  const exposureScore =
    inputs.outstandingAmount > 0
      ? clamp01(1 - inputs.overdueAmount / inputs.outstandingAmount)
      : 1;

  const weighted =
    0.4 * onTimeRate +
    0.25 * defaultScore +
    0.15 * delayScore +
    0.1 * partialScore +
    0.1 * exposureScore;

  const score = Math.round(clamp01(weighted) * 100);
  return { score, band: riskBandFor(score) };
}

/** Simple INR currency formatter (₹1,23,456.78). */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount ?? 0);
}
