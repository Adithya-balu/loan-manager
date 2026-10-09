import { describe, expect, it } from 'vitest';
import { generateSchedule, reamortizeRemaining, round2 } from './finance.js';
import type { InterestMethod, LoanFrequency, ScheduleParams, ScheduleSummary } from './types.js';

const schedule = (p: Partial<ScheduleParams>) =>
  generateSchedule({
    principal: 10000,
    annualRatePct: 12,
    frequency: 'MONTHLY',
    installments: 12,
    startDate: '2026-01-01',
    method: 'FLAT',
    ...p,
  });

const sum = (s: ScheduleSummary, key: 'principalComponent' | 'interestComponent' | 'amountDue') =>
  round2(s.rows.reduce((a, r) => a + r[key], 0));

/** Invariants every schedule must satisfy, whatever the inputs. */
function expectWellFormed(s: ScheduleSummary, principal: number) {
  expect(sum(s, 'principalComponent')).toBe(round2(principal));
  expect(sum(s, 'interestComponent')).toBe(s.totalInterest);
  expect(sum(s, 'amountDue')).toBe(s.totalPayable);
  expect(s.totalPayable).toBe(round2(s.totalPrincipal + s.totalInterest));
  expect(s.rows.at(-1)!.closingBalance).toBe(0);
  s.rows.forEach((r, k) => {
    expect(r.sequence).toBe(k + 1);
    expect(r.principalComponent).toBeGreaterThanOrEqual(0);
    expect(r.interestComponent).toBeGreaterThanOrEqual(0);
    expect(r.amountDue).toBeGreaterThan(0);
    expect(r.amountDue).toBe(round2(r.principalComponent + r.interestComponent));
    expect(r.closingBalance).toBe(round2(r.openingBalance - r.principalComponent));
    expect(r.closingBalance).toBeGreaterThanOrEqual(0);
    if (k > 0) expect(r.openingBalance).toBe(s.rows[k - 1].closingBalance);
  });
  expect(s.rows[0].openingBalance).toBe(round2(principal));
}

describe('flat interest — hand-computed examples', () => {
  it('₹1,00,000 at 12% for 12 months: interest ₹12,000, ₹9,333.33 a month', () => {
    const s = schedule({ principal: 100000, annualRatePct: 12, installments: 12 });
    expect(s.totalInterest).toBe(12000);
    expect(s.totalPayable).toBe(112000);
    expect(s.installmentAmount).toBe(9333.33);
    expect(s.rows.every((r) => r.interestComponent === 1000)).toBe(true);
    // Principal 1,00,000 / 12 = 8,333.33…: rows alternate 8,333.33 / 8,333.34 and sum exactly.
    expect(new Set(s.rows.map((r) => r.principalComponent))).toEqual(new Set([8333.33, 8333.34]));
  });

  it('weekly: T = weeks / 52 (₹10,000 at 26% for 10 weeks → ₹500)', () => {
    const s = schedule({ principal: 10000, annualRatePct: 26, frequency: 'WEEKLY', installments: 10 });
    expect(s.totalInterest).toBe(500);
    expect(s.rows.every((r) => r.amountDue === 1050)).toBe(true);
  });

  it('daily: T = days / 365 (₹1,000 at 36.5% for 100 days → ₹100)', () => {
    const s = schedule({ principal: 1000, annualRatePct: 36.5, frequency: 'DAILY', installments: 100 });
    expect(s.totalInterest).toBe(100);
    expect(s.rows.every((r) => r.amountDue === 11)).toBe(true);
  });

  it('a single installment repays everything at once', () => {
    const s = schedule({ principal: 5000, annualRatePct: 24, installments: 1 });
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]).toMatchObject({ principalComponent: 5000, interestComponent: 100, amountDue: 5100, closingBalance: 0 });
  });

  it('0% means no interest and an even split', () => {
    const s = schedule({ principal: 10000, annualRatePct: 0, installments: 3 });
    expect(s.totalInterest).toBe(0);
    expect(s.rows.map((r) => r.amountDue)).toEqual([3333.33, 3333.34, 3333.33]);
  });

  it('never produces a negative last installment on small daily loans (regression)', () => {
    // Previously the per-day interest rounded up and the last row went negative.
    const s = schedule({ principal: 1000, annualRatePct: 12, frequency: 'DAILY', installments: 365 });
    expectWellFormed(s, 1000);
    const amounts = s.rows.map((r) => r.amountDue);
    expect(round2(Math.max(...amounts) - Math.min(...amounts))).toBeLessThanOrEqual(0.02);
  });
});

describe('reducing balance (EMI) — hand-computed examples', () => {
  it('₹1,00,000 at 12% for 12 months: EMI ₹8,884.88, interest ₹6,618.55', () => {
    const s = schedule({ principal: 100000, annualRatePct: 12, installments: 12, method: 'REDUCING' });
    expect(s.installmentAmount).toBe(8884.88);
    expect(s.totalInterest).toBe(6618.55);
    // Month 1: interest 1% of 1,00,000; month 2: 1% of the reduced balance.
    expect(s.rows[0]).toMatchObject({ interestComponent: 1000, principalComponent: 7884.88, closingBalance: 92115.12 });
    expect(s.rows[1]).toMatchObject({ interestComponent: 921.15, principalComponent: 7963.73 });
  });

  it('₹5,200 at 52% weekly (1%/week) for 4 weeks: EMI ₹1,332.66', () => {
    const s = schedule({ principal: 5200, annualRatePct: 52, frequency: 'WEEKLY', installments: 4, method: 'REDUCING' });
    expect(s.installmentAmount).toBe(1332.66);
    expect(s.rows[0]).toMatchObject({ interestComponent: 52, principalComponent: 1280.66 });
    expect(s.rows[1].interestComponent).toBe(39.19); // 1% of 3,919.34
  });

  it('interest falls and principal rises every period', () => {
    const s = schedule({ principal: 250000, annualRatePct: 18, installments: 24, method: 'REDUCING' });
    for (let k = 1; k < s.rows.length; k++) {
      expect(s.rows[k].interestComponent).toBeLessThan(s.rows[k - 1].interestComponent);
      expect(s.rows[k].principalComponent).toBeGreaterThan(s.rows[k - 1].principalComponent);
    }
  });

  it('costs less interest than flat for the same terms', () => {
    const flat = schedule({ principal: 50000, annualRatePct: 24, installments: 12 });
    const reducing = schedule({ principal: 50000, annualRatePct: 24, installments: 12, method: 'REDUCING' });
    expect(reducing.totalInterest).toBeLessThan(flat.totalInterest);
  });

  it('0% reducing equals an even principal split', () => {
    const s = schedule({ principal: 10000, annualRatePct: 0, installments: 3, method: 'REDUCING' });
    expect(s.totalInterest).toBe(0);
    expect(s.rows.map((r) => r.amountDue)).toEqual([3333.33, 3333.34, 3333.33]);
  });

  it('long high-rate schedules stay level (regression)', () => {
    // Previously rounding drift made the last installment 26x the others.
    const s = schedule({ principal: 500, annualRatePct: 48, installments: 365, method: 'REDUCING' });
    expectWellFormed(s, 500);
    const amounts = s.rows.map((r) => r.amountDue);
    expect(round2(Math.max(...amounts) - Math.min(...amounts))).toBeLessThanOrEqual(0.02);
  });
});

describe('schedule invariants across a matrix of loan terms', () => {
  const methods: InterestMethod[] = ['FLAT', 'REDUCING'];
  const frequencies: LoanFrequency[] = ['DAILY', 'WEEKLY', 'MONTHLY'];
  const principals = [500, 1234.56, 25000, 1000000];
  const rates = [0, 9.5, 24, 60];
  const counts = [1, 2, 7, 12, 30, 100, 365];

  for (const method of methods)
    for (const frequency of frequencies)
      it(`${method} / ${frequency}: reconciles, never negative, level installments`, () => {
        for (const principal of principals)
          for (const annualRatePct of rates)
            for (const installments of counts) {
              const s = generateSchedule({ principal, annualRatePct, frequency, installments, startDate: '2026-01-01', method });
              expectWellFormed(s, principal);
              expect(s.rows).toHaveLength(installments);
              const amounts = s.rows.map((r) => r.amountDue);
              expect(round2(Math.max(...amounts) - Math.min(...amounts))).toBeLessThanOrEqual(0.02);
            }
      });
});

describe('input handling', () => {
  it('floors fractional installment counts and treats < 1 as one installment', () => {
    expect(schedule({ installments: 6.9 }).rows).toHaveLength(6);
    expect(schedule({ installments: 0 }).rows).toHaveLength(1);
  });

  it('rounds a sub-paisa principal to paise', () => {
    const s = schedule({ principal: 1000.004, annualRatePct: 0, installments: 2 });
    expect(s.totalPrincipal).toBe(1000);
    expect(sum(s, 'principalComponent')).toBe(1000);
  });

  it('due dates follow the frequency from the start date', () => {
    expect(schedule({ frequency: 'DAILY', installments: 3, startDate: '2026-02-27' }).rows.map((r) => r.dueDate)).toEqual([
      '2026-02-27', '2026-02-28', '2026-03-01',
    ]);
    expect(schedule({ frequency: 'WEEKLY', installments: 2, startDate: '2026-12-28' }).rows.map((r) => r.dueDate)).toEqual([
      '2026-12-28', '2027-01-04',
    ]);
    expect(schedule({ installments: 4, startDate: '2026-01-31' }).rows.map((r) => r.dueDate)).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
    ]);
  });
});

describe('re-amortization after capitalization', () => {
  it.each(['FLAT', 'REDUCING'] as const)('%s: same count, starts at the first open due date, clears the new outstanding', (method) => {
    const s = reamortizeRemaining({
      newOutstanding: 55000.004, remainingInstallments: 6, annualRatePct: 12,
      frequency: 'MONTHLY', firstDueDate: '2026-07-15', method,
    });
    expect(s.rows).toHaveLength(6);
    expect(s.rows[0].dueDate).toBe('2026-07-15');
    expect(s.rows.at(-1)!.dueDate).toBe('2026-12-15');
    expectWellFormed(s, 55000);
  });

  it('charges interest only for the remaining term', () => {
    const s = reamortizeRemaining({
      newOutstanding: 12000, remainingInstallments: 6, annualRatePct: 12,
      frequency: 'MONTHLY', firstDueDate: '2026-07-01', method: 'FLAT',
    });
    expect(s.totalInterest).toBe(720); // 12,000 × 12% × 6/12
  });
});
