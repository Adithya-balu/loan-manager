// Pure unit tests for installment status, grace/default thresholds, loan
// roll-ups and settlement quotes. No database: loans and installments are
// built in memory and evaluated against a fixed reference date.
import type { Installment, Loan } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { parseISODate } from '@loan/shared';
import {
  DEFAULT_SETTINGS,
  computeSettlement,
  deriveStatus,
  effectiveDefaultThreshold,
  effectiveGraceDays,
  enrichInstallment,
  rollupLoan,
} from '../src/lib/loanService.js';

const d = parseISODate;
const REF = d('2026-06-15');

function loan(over: Partial<Loan> = {}): Loan {
  return {
    id: 'L1', customerId: 'C1', principal: 3000, annualRatePct: 0, frequency: 'MONTHLY',
    interestMethod: 'FLAT', installments: 3, disbursementDate: d('2026-04-01'),
    repaymentStartDate: d('2026-05-01'), disbursementMode: 'CASH', guarantorName: null,
    guarantorMobile: null, guarantorRelation: null, guarantorAddress: null, status: 'ACTIVE',
    graceDaysOverride: null, defaultThresholdDaysOverride: null,
    createdAt: d('2026-04-01'), updatedAt: d('2026-04-01'), ...over,
  };
}

function inst(sequence: number, due: string, over: Partial<Installment> = {}): Installment {
  return {
    id: `I${sequence}`, loanId: 'L1', sequence, dueDate: d(due), amountDue: 1000,
    principalComponent: 1000, interestComponent: 0, paidAmount: 0, status: 'SCHEDULED',
    paidDate: null, capitalizedAmount: 0, waivedAmount: 0, ...over,
  };
}

const pay = (date: string, amount: number) => ({ date: d(date), amount });

describe('installment status (deriveStatus)', () => {
  it.each([
    ['future, unpaid', inst(1, '2026-06-20'), 'SCHEDULED'],
    ['future, part-paid', inst(1, '2026-06-20', { paidAmount: 100 }), 'PARTIAL'],
    ['due today, unpaid', inst(1, '2026-06-15'), 'DUE'],
    ['due today, part-paid', inst(1, '2026-06-15', { paidAmount: 100 }), 'PARTIAL'],
    ['past due, unpaid', inst(1, '2026-06-14'), 'OVERDUE'],
    ['past due, part-paid', inst(1, '2026-06-10', { paidAmount: 999 }), 'OVERDUE'],
    ['fully paid (even if future)', inst(1, '2026-07-01', { paidAmount: 1000 }), 'PAID'],
    ['within half a paisa counts as paid', inst(1, '2026-06-01', { paidAmount: 999.996 }), 'PAID'],
    ['defaulted wins over everything', inst(1, '2026-06-01', { status: 'DEFAULTED', paidAmount: 1000 }), 'DEFAULTED'],
  ])('%s → %s', (_label, i, expected) => {
    expect(deriveStatus(i, REF)).toBe(expected);
  });
});

describe('grace period (enrichInstallment)', () => {
  it('needs action only once days past due exceed the grace days', () => {
    expect(enrichInstallment(inst(1, '2026-06-13'), 2, REF)).toMatchObject({ daysPastDue: 2, actionRequired: false });
    expect(enrichInstallment(inst(1, '2026-06-12'), 2, REF)).toMatchObject({ daysPastDue: 3, actionRequired: true });
  });

  it('a grace of 0 flags the day after the due date', () => {
    expect(enrichInstallment(inst(1, '2026-06-15'), 0, REF).actionRequired).toBe(false);
    expect(enrichInstallment(inst(1, '2026-06-14'), 0, REF).actionRequired).toBe(true);
  });

  it('paid or future installments never need action', () => {
    expect(enrichInstallment(inst(1, '2026-01-01', { paidAmount: 1000 }), 2, REF).actionRequired).toBe(false);
    expect(enrichInstallment(inst(1, '2026-07-01'), 2, REF)).toMatchObject({ daysPastDue: 0, actionRequired: false });
  });

  it('reports the remaining amount', () => {
    expect(enrichInstallment(inst(1, '2026-06-01', { paidAmount: 250.5 }), 2, REF).remaining).toBe(749.5);
  });
});

describe('effective grace / default thresholds', () => {
  it('uses the loan-type defaults unless the loan overrides them', () => {
    expect(effectiveGraceDays(loan({ frequency: 'DAILY' }), DEFAULT_SETTINGS)).toBe(2);
    expect(effectiveGraceDays(loan({ frequency: 'WEEKLY' }), DEFAULT_SETTINGS)).toBe(5);
    expect(effectiveDefaultThreshold(loan({ frequency: 'MONTHLY' }), DEFAULT_SETTINGS)).toBe(21);
    expect(effectiveGraceDays(loan({ graceDaysOverride: 10 }), DEFAULT_SETTINGS)).toBe(10);
    expect(effectiveDefaultThreshold(loan({ defaultThresholdDaysOverride: 3 }), DEFAULT_SETTINGS)).toBe(3);
  });

  it('an override of 0 is respected (not treated as "unset")', () => {
    expect(effectiveGraceDays(loan({ graceDaysOverride: 0 }), DEFAULT_SETTINGS)).toBe(0);
    expect(effectiveDefaultThreshold(loan({ defaultThresholdDaysOverride: 0 }), DEFAULT_SETTINGS)).toBe(0);
  });
});

describe('loan roll-up (rollupLoan)', () => {
  // #1 due 05-01 paid, #2 due 06-01 part-paid (overdue), #3 due 07-01 future.
  const schedule = () => [
    inst(1, '2026-05-01', { paidAmount: 1000, status: 'PAID', paidDate: d('2026-05-01') }),
    inst(2, '2026-06-01', { paidAmount: 300, status: 'PARTIAL' }),
    inst(3, '2026-07-01'),
  ];
  const payments = [pay('2026-05-01', 1000), pay('2026-06-10', 300)];

  it('totals, outstanding, overdue and next due', () => {
    const r = rollupLoan({ ...loan(), schedule: schedule(), payments }, DEFAULT_SETTINGS, REF);
    expect(r).toMatchObject({
      totalPayable: 3000, totalPaid: 1300, outstanding: 1700, overdueAmount: 700,
      paidInstallments: 1, openInstallments: 2, nextDueDate: '2026-06-01',
      actionRequiredCount: 1, lastPaymentDate: '2026-06-10',
    });
  });

  it('collected is cash received, even when installments include waived interest', () => {
    const settled = schedule().map((i) => ({ ...i, paidAmount: i.amountDue, status: 'PAID' as const, waivedAmount: i.sequence === 3 ? 50 : 0 }));
    const r = rollupLoan({ ...loan({ status: 'CLOSED' }), schedule: settled, payments: [pay('2026-06-15', 2950)] }, DEFAULT_SETTINGS, REF);
    expect(r.totalPaid).toBe(2950);
    expect(r.outstanding).toBe(0);
  });

  it('excludes defaulted installments from outstanding and never goes negative', () => {
    const s = [
      inst(1, '2026-05-01', { status: 'DEFAULTED', capitalizedAmount: 1000 }),
      inst(2, '2026-06-01', { paidAmount: 1200, status: 'PAID' }), // overpaid
      inst(3, '2026-07-01', { amountDue: 2000 }),
    ];
    const r = rollupLoan({ ...loan(), schedule: s, payments: [pay('2026-06-01', 1200)] }, DEFAULT_SETTINGS, REF);
    expect(r.outstanding).toBe(2000);
    expect(r.overdueAmount).toBe(0);
  });

  describe('default eligibility', () => {
    const monthly = (lastPayment: string | null, over: Partial<Loan> = {}) =>
      rollupLoan(
        { ...loan(over), schedule: schedule(), payments: lastPayment ? [pay(lastPayment, 100)] : [] },
        DEFAULT_SETTINGS,
        REF,
      ).loanDefaultEligible;

    it('becomes eligible exactly at the threshold (21 days for monthly)', () => {
      expect(monthly('2026-05-26')).toBe(false); // 20 days
      expect(monthly('2026-05-25')).toBe(true); // 21 days
    });

    it('counts from disbursement when nothing was ever paid', () => {
      expect(monthly(null, { disbursementDate: d('2026-05-26') })).toBe(false);
      expect(monthly(null, { disbursementDate: d('2026-05-25') })).toBe(true);
    });

    it('respects a per-loan threshold override', () => {
      expect(monthly('2026-06-12', { defaultThresholdDaysOverride: 3 })).toBe(true);
    });

    it('never applies to closed/defaulted loans or loans with nothing open', () => {
      expect(monthly('2026-01-01', { status: 'CLOSED' })).toBe(false);
      expect(monthly('2026-01-01', { status: 'DEFAULTED' })).toBe(false);
      const allPaid = schedule().map((i) => ({ ...i, paidAmount: 1000 }));
      expect(rollupLoan({ ...loan(), schedule: allPaid, payments: [pay('2026-01-01', 3000)] }, DEFAULT_SETTINGS, REF).loanDefaultEligible).toBe(false);
    });
  });
});

describe('settlement quote (computeSettlement)', () => {
  // 36.5% a year → 0.1% a day.
  const interestLoan = (over: Partial<Loan> = {}) => loan({ principal: 10000, annualRatePct: 36.5, ...over });

  it('before any due date: principal + daily interest since disbursement', () => {
    const s = [inst(1, '2026-07-01', { amountDue: 5000, principalComponent: 5000 }), inst(2, '2026-08-01', { amountDue: 5000, principalComponent: 5000 })];
    const q = computeSettlement({ ...interestLoan({ disbursementDate: d('2026-06-05') }), schedule: s }, DEFAULT_SETTINGS, REF);
    expect(q).toEqual({ loanId: 'L1', asOf: '2026-06-15', overdueDue: 0, remainingPrincipal: 10000, interestToDate: 100, settlementAmount: 10100 });
  });

  it('matured installments are owed in full; interest runs from the last due date', () => {
    const s = [
      inst(1, '2026-06-01', { amountDue: 5300, principalComponent: 5000, interestComponent: 300 }),
      inst(2, '2026-07-01', { amountDue: 5300, principalComponent: 5000, interestComponent: 300 }),
    ];
    const q = computeSettlement({ ...interestLoan(), schedule: s }, DEFAULT_SETTINGS, REF);
    // Future scheduled interest (300) is waived; 14 days × 0.1% × 5 000 = 70.
    expect(q).toMatchObject({ overdueDue: 5300, remainingPrincipal: 5000, interestToDate: 70, settlementAmount: 10370 });
  });

  it('a paid installment still marks where interest-to-date starts (regression)', () => {
    // #1 (due 06-01) was paid on time; interest for April–May was in it, so only
    // 14 days (06-01 → 06-15) accrue — not 75 days from disbursement.
    const s = [
      inst(1, '2026-06-01', { amountDue: 5300, principalComponent: 5000, interestComponent: 300, paidAmount: 5300, status: 'PAID' }),
      inst(2, '2026-07-01', { amountDue: 5300, principalComponent: 5000, interestComponent: 300 }),
    ];
    const q = computeSettlement({ ...interestLoan(), schedule: s }, DEFAULT_SETTINGS, REF);
    expect(q).toMatchObject({ overdueDue: 0, remainingPrincipal: 5000, interestToDate: 70, settlementAmount: 5070 });
  });

  it('paying on time never makes settling dearer than settling in arrears', () => {
    const schedule = (paid: boolean) => [
      inst(1, '2026-06-01', { amountDue: 5300, principalComponent: 5000, interestComponent: 300, paidAmount: paid ? 5300 : 0 }),
      inst(2, '2026-07-01', { amountDue: 5300, principalComponent: 5000, interestComponent: 300 }),
    ];
    const onTime = 5300 + computeSettlement({ ...interestLoan(), schedule: schedule(true) }, DEFAULT_SETTINGS, REF).settlementAmount;
    const inArrears = computeSettlement({ ...interestLoan(), schedule: schedule(false) }, DEFAULT_SETTINGS, REF).settlementAmount;
    expect(onTime).toBe(inArrears);
  });

  it('an installment due on the settlement date counts as matured', () => {
    const s = [inst(1, '2026-06-15', { amountDue: 1100, principalComponent: 1000, interestComponent: 100 })];
    const q = computeSettlement({ ...interestLoan(), schedule: s }, DEFAULT_SETTINGS, REF);
    expect(q).toMatchObject({ overdueDue: 1100, remainingPrincipal: 0, interestToDate: 0 });
  });

  it('partial payments on future installments cover interest first, then principal', () => {
    const covered = (paidAmount: number) =>
      computeSettlement(
        { ...loan({ disbursementDate: d('2026-06-15') }), schedule: [inst(1, '2026-07-01', { amountDue: 1100, principalComponent: 1000, interestComponent: 100, paidAmount })] },
        DEFAULT_SETTINGS,
        REF,
      ).remainingPrincipal;
    expect(covered(60)).toBe(1000); // all of it went to interest
    expect(covered(150)).toBe(950); // 100 interest + 50 principal
    expect(covered(1100)).toBe(0);
  });

  it('ignores defaulted and fully paid installments', () => {
    const s = [
      inst(1, '2026-05-01', { status: 'DEFAULTED', capitalizedAmount: 1000 }),
      inst(2, '2026-06-01', { paidAmount: 1000 }),
      inst(3, '2026-07-01'),
    ];
    const q = computeSettlement({ ...loan({ disbursementDate: d('2026-06-15') }), schedule: s }, DEFAULT_SETTINGS, REF);
    expect(q).toMatchObject({ overdueDue: 0, remainingPrincipal: 1000, settlementAmount: 1000 });
  });

  it('a date before disbursement charges no interest', () => {
    const s = [inst(1, '2026-07-01')];
    const q = computeSettlement({ ...interestLoan({ principal: 1000, disbursementDate: d('2026-06-20') }), schedule: s }, DEFAULT_SETTINGS, REF);
    expect(q.interestToDate).toBe(0);
  });

  it('later dates quote more interest, never less', () => {
    const s = [inst(1, '2026-12-01', { amountDue: 10000, principalComponent: 10000 })];
    const quote = (ref: string) => computeSettlement({ ...interestLoan({ disbursementDate: d('2026-06-01') }), schedule: s }, DEFAULT_SETTINGS, d(ref)).settlementAmount;
    expect(quote('2026-06-01')).toBe(10000);
    expect(quote('2026-06-11')).toBe(10100);
    expect(quote('2026-07-01')).toBe(10300);
  });
});
