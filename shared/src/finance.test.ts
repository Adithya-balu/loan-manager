import { describe, it, expect } from 'vitest';
import {
  generateSchedule,
  reamortizeRemaining,
  computeRisk,
  round2,
  periodsPerYear,
  dueDateFor,
  parseISODate,
  toISODate,
} from './finance.js';

describe('schedule dates', () => {
  it('daily adds one day per installment', () => {
    const start = parseISODate('2026-01-01');
    expect(toISODate(dueDateFor(start, 'DAILY', 0))).toBe('2026-01-01');
    expect(toISODate(dueDateFor(start, 'DAILY', 5))).toBe('2026-01-06');
  });
  it('weekly adds seven days per installment', () => {
    const start = parseISODate('2026-01-01');
    expect(toISODate(dueDateFor(start, 'WEEKLY', 2))).toBe('2026-01-15');
  });
  it('monthly clamps end-of-month', () => {
    const start = parseISODate('2026-01-31');
    expect(toISODate(dueDateFor(start, 'MONTHLY', 1))).toBe('2026-02-28');
  });
});

describe('flat rate interest', () => {
  it('Interest = P x R x T and equal installments', () => {
    // 12 monthly, 12% annual, T = 1 year => interest = 12000
    const s = generateSchedule({
      principal: 100000,
      annualRatePct: 12,
      frequency: 'MONTHLY',
      installments: 12,
      startDate: '2026-01-01',
      method: 'FLAT',
    });
    expect(s.totalInterest).toBe(12000);
    expect(s.totalPayable).toBe(112000);
    expect(s.rows).toHaveLength(12);
    // (100000 + 12000) / 12
    expect(s.installmentAmount).toBeCloseTo(9333.33, 2);
  });

  it('totals reconcile exactly with rounding in last row', () => {
    const s = generateSchedule({
      principal: 100000,
      annualRatePct: 15,
      frequency: 'DAILY',
      installments: 100,
      startDate: '2026-01-01',
      method: 'FLAT',
    });
    const sumPrincipal = round2(s.rows.reduce((a, r) => a + r.principalComponent, 0));
    const sumInterest = round2(s.rows.reduce((a, r) => a + r.interestComponent, 0));
    expect(sumPrincipal).toBe(100000);
    expect(sumInterest).toBe(s.totalInterest);
  });
});

describe('reducing balance (EMI)', () => {
  it('final balance is zero and EMI is constant except last', () => {
    const s = generateSchedule({
      principal: 100000,
      annualRatePct: 12,
      frequency: 'MONTHLY',
      installments: 12,
      startDate: '2026-01-01',
      method: 'REDUCING',
    });
    expect(s.rows[s.rows.length - 1].closingBalance).toBe(0);
    // Standard EMI for 1L @ 1%/month for 12 months ≈ 8884.88
    expect(s.installmentAmount).toBeCloseTo(8884.88, 1);
    const sumPrincipal = round2(s.rows.reduce((a, r) => a + r.principalComponent, 0));
    expect(sumPrincipal).toBe(100000);
  });

  it('handles zero interest gracefully', () => {
    const s = generateSchedule({
      principal: 12000,
      annualRatePct: 0,
      frequency: 'MONTHLY',
      installments: 12,
      startDate: '2026-01-01',
      method: 'REDUCING',
    });
    expect(s.totalInterest).toBe(0);
    expect(s.installmentAmount).toBe(1000);
  });
});

describe('re-amortization after capitalization', () => {
  it('keeps the same remaining count and clears the new outstanding', () => {
    const s = reamortizeRemaining({
      newOutstanding: 55000,
      remainingInstallments: 6,
      annualRatePct: 12,
      frequency: 'MONTHLY',
      firstDueDate: '2026-07-01',
      method: 'REDUCING',
    });
    expect(s.rows).toHaveLength(6);
    expect(s.rows[s.rows.length - 1].closingBalance).toBe(0);
    expect(s.totalPrincipal).toBe(55000);
  });
});

describe('risk score', () => {
  it('returns UNKNOWN with no history', () => {
    const r = computeRisk({
      matured: 0,
      paidOnTime: 0,
      paidLate: 0,
      partial: 0,
      defaulted: 0,
      avgDelayDays: 0,
      overdueAmount: 0,
      outstandingAmount: 0,
    });
    expect(r.score).toBeNull();
    expect(r.band).toBe('UNKNOWN');
  });

  it('perfect history scores high (low risk)', () => {
    const r = computeRisk({
      matured: 20,
      paidOnTime: 20,
      paidLate: 0,
      partial: 0,
      defaulted: 0,
      avgDelayDays: 0,
      overdueAmount: 0,
      outstandingAmount: 50000,
    });
    expect(r.score).toBe(100);
    expect(r.band).toBe('LOW');
  });

  it('defaults and delays drag the score down', () => {
    const r = computeRisk({
      matured: 20,
      paidOnTime: 5,
      paidLate: 8,
      partial: 3,
      defaulted: 7,
      avgDelayDays: 20,
      overdueAmount: 30000,
      outstandingAmount: 50000,
    });
    expect(r.score).not.toBeNull();
    expect(r.score!).toBeLessThan(50);
    expect(['HIGH', 'MEDIUM']).toContain(r.band);
  });
});

describe('periodsPerYear', () => {
  it('maps frequencies', () => {
    expect(periodsPerYear('DAILY')).toBe(365);
    expect(periodsPerYear('WEEKLY')).toBe(52);
    expect(periodsPerYear('MONTHLY')).toBe(12);
  });
});
