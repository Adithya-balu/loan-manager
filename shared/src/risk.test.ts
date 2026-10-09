import { describe, expect, it } from 'vitest';
import { computeRisk, riskBandFor } from './finance.js';
import type { RiskInputs } from './types.js';

const inputs = (over: Partial<RiskInputs>): RiskInputs => ({
  matured: 10, paidOnTime: 10, paidLate: 0, partial: 0, defaulted: 0,
  avgDelayDays: 0, overdueAmount: 0, outstandingAmount: 0, ...over,
});

describe('risk score weights (40/25/15/10/10)', () => {
  it('matches a hand calculation', () => {
    // on-time 5/10 → 0.5×40 = 20; no defaults → 25; delay 15/30 → 0.5×15 = 7.5;
    // partial 2/10 → 0.8×10 = 8; overdue 1,000/4,000 → 0.75×10 = 7.5. Total 68.
    const r = computeRisk(inputs({ paidOnTime: 5, paidLate: 3, partial: 2, avgDelayDays: 15, overdueAmount: 1000, outstandingAmount: 4000 }));
    expect(r).toEqual({ score: 68, band: 'LOW' });
  });

  it('each factor lowers the score on its own', () => {
    const perfect = computeRisk(inputs({})).score!;
    expect(perfect).toBe(100);
    expect(computeRisk(inputs({ paidOnTime: 0, paidLate: 10 })).score).toBe(60);
    expect(computeRisk(inputs({ defaulted: 10 })).score).toBe(75);
    expect(computeRisk(inputs({ avgDelayDays: 30 })).score).toBe(85);
    expect(computeRisk(inputs({ partial: 10 })).score).toBe(90);
    expect(computeRisk(inputs({ overdueAmount: 500, outstandingAmount: 500 })).score).toBe(90);
  });

  it('clamps out-of-range inputs', () => {
    expect(computeRisk(inputs({ avgDelayDays: 90 })).score).toBe(85);
    expect(computeRisk(inputs({ overdueAmount: 900, outstandingAmount: 100 })).score).toBe(90);
    expect(computeRisk(inputs({ paidOnTime: 0, defaulted: 20, partial: 20, avgDelayDays: 100, overdueAmount: 1, outstandingAmount: 1 })).score).toBe(0);
  });

  it('no outstanding balance means no exposure penalty', () => {
    expect(computeRisk(inputs({ overdueAmount: 0, outstandingAmount: 0 })).score).toBe(100);
  });

  it('no matured installments is UNKNOWN', () => {
    expect(computeRisk(inputs({ matured: 0 }))).toEqual({ score: null, band: 'UNKNOWN' });
  });
});

describe('risk bands', () => {
  it.each([
    [100, 'LOW'], [67, 'LOW'], [66, 'MEDIUM'], [34, 'MEDIUM'], [33, 'HIGH'], [0, 'HIGH'], [null, 'UNKNOWN'],
  ] as const)('%s → %s', (score, band) => {
    expect(riskBandFor(score)).toBe(band);
  });
});
