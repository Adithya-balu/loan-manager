// End-to-end loan life-cycle journeys through the API. After every step the
// loan's ledger is reconciled: money applied to installments must equal cash
// received, outstanding must equal what's unpaid, and statuses must agree.
import { beforeEach, describe, expect, it } from 'vitest';
import { round2 } from '@loan/shared';
import { type Client, createCustomer, createLoan, iso, login, pay, resetDb } from './helpers.js';

let admin: Client;
let customerId: string;

beforeEach(async () => {
  await resetDb();
  admin = await login();
  customerId = (await createCustomer(admin)).id;
});

interface Inst {
  id: string; sequence: number; dueDate: string; amountDue: number; principalComponent: number;
  interestComponent: number; paidAmount: number; waivedAmount: number; capitalizedAmount: number;
  interestPaid: number; principalPaid: number;
  status: string; derivedStatus: string; remaining: number; actionRequired: boolean; paidDate: string | null;
}
interface Detail {
  id: string; status: string; principal: number;
  schedule: Inst[];
  payments: { id: string; amount: number; kind: string; settlementInterest: number | null; date: string; interestAmount: number; principalAmount: number }[];
  rollup: { totalPaid: number; interestCollected: number; principalCollected: number; outstanding: number; overdueAmount: number; totalPayable: number; totalInterest: number; loanDefaultEligible: boolean; paidInstallments: number };
}

const getDetail = async (id: string): Promise<Detail> => (await admin.get(`/api/loans/${id}`)).body;
const sum = <T>(xs: T[], f: (x: T) => number) => round2(xs.reduce((a, x) => a + f(x), 0));

/** Reconcile a loan's ledger; returns the detail for further assertions. */
async function reconciled(loanId: string): Promise<Detail> {
  const d = await getDetail(loanId);
  const cash = sum(d.payments, (p) => p.amount);
  const settlementInterest = sum(d.payments, (p) => p.settlementInterest ?? 0);
  const appliedToSchedule = sum(d.schedule, (i) => i.paidAmount - i.waivedAmount);

  expect(d.rollup.totalPaid, 'collected = cash received').toBeCloseTo(cash, 2);
  expect(appliedToSchedule, 'installments hold exactly the cash (net of settlement interest)').toBeCloseTo(cash - settlementInterest, 2);

  // Interest before principal: splits add up, interest never exceeds what's scheduled,
  // and the interest received across payments is what installments hold (+ settlement interest).
  for (const i of d.schedule) {
    expect(round2(i.interestPaid + i.principalPaid + i.waivedAmount), `#${i.sequence} split adds up`).toBe(i.paidAmount);
    expect(i.interestPaid + i.waivedAmount).toBeLessThanOrEqual(i.interestComponent + 0.005);
    if (i.principalPaid > 0.005) expect(round2(i.interestPaid + i.waivedAmount), `#${i.sequence} interest first`).toBe(i.interestComponent);
  }
  for (const p of d.payments) expect(round2(p.interestAmount + p.principalAmount), 'payment split adds up').toBe(p.amount);
  expect(sum(d.payments, (p) => p.interestAmount)).toBeCloseTo(sum(d.schedule, (i) => i.interestPaid) + settlementInterest, 2);
  expect(d.rollup.interestCollected).toBeCloseTo(sum(d.payments, (p) => p.interestAmount), 2);

  const unpaid = sum(d.schedule.filter((i) => i.status !== 'DEFAULTED'), (i) => Math.max(0, i.amountDue - i.paidAmount));
  expect(d.rollup.outstanding, 'outstanding = unpaid').toBeCloseTo(unpaid, 2);
  expect(d.rollup.outstanding).toBeGreaterThanOrEqual(0);

  for (const i of d.schedule) {
    if (i.status === 'DEFAULTED') continue;
    const full = i.paidAmount >= i.amountDue - 0.005;
    expect(i.derivedStatus === 'PAID', `#${i.sequence} PAID iff fully paid`).toBe(full);
    if (full) expect(i.paidDate, `#${i.sequence} has a paid date`).toBeTruthy();
  }
  const everythingSettled = d.schedule.every((i) => i.status === 'DEFAULTED' || i.paidAmount >= i.amountDue - 0.005);
  if (d.status !== 'DEFAULTED') expect(d.status, 'fully paid loans are CLOSED').toBe(everythingSettled ? 'CLOSED' : 'ACTIVE');
  return d;
}

const dashboard = async () => (await admin.get('/api/dashboard')).body;
const risk = async () => (await admin.get(`/api/customers/${customerId}`)).body.risk;

describe('journey 1 — reducing-balance loan repaid on schedule', () => {
  it('pays every EMI on its due date, closes, books all interest, scores LOW risk', async () => {
    const loan = await createLoan(admin, customerId, {
      principal: 100000, annualRatePct: 12, frequency: 'MONTHLY', interestMethod: 'REDUCING',
      installments: 12, disbursementDate: iso(-400), repaymentStartDate: iso(-370),
    });
    const start = await reconciled(loan.id);
    expect(start.rollup.totalInterest).toBeCloseTo(6618.55, 2);
    expect(start.rollup.overdueAmount).toBeCloseTo(start.rollup.totalPayable, 2); // all past due, nothing paid

    for (const inst of start.schedule) {
      const res = await pay(admin, loan.id, inst.amountDue, inst.dueDate.slice(0, 10), { installmentId: inst.id });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const d = await reconciled(loan.id);
      expect(d.rollup.paidInstallments).toBe(inst.sequence);
    }

    const end = await reconciled(loan.id);
    expect(end.status).toBe('CLOSED');
    expect(end.rollup).toMatchObject({ outstanding: 0, overdueAmount: 0 });
    expect(end.rollup.totalPaid).toBeCloseTo(106618.55, 2);
    expect((await dashboard()).kpis.interestEarned).toBeCloseTo(6618.55, 2);
    expect(await risk()).toEqual({ score: 100, band: 'LOW' });
    // A closed loan takes no more money.
    expect((await pay(admin, loan.id, 1)).status).toBe(400);
  });
});

describe('journey 2 — flat weekly loan with partial, late and overpayments', () => {
  it('tracks statuses through irregular payments and closes on the overpayment', async () => {
    // 4 000 at 26% flat for 4 weeks → interest 4 000 × 0.26 × 4/52 = 80, so 1 020 a week.
    const loan = await createLoan(admin, customerId, {
      principal: 4000, annualRatePct: 26, frequency: 'WEEKLY', interestMethod: 'FLAT',
      installments: 4, disbursementDate: iso(-35), repaymentStartDate: iso(-28),
    });
    let d = await reconciled(loan.id);
    expect(d.schedule.map((i) => i.amountDue)).toEqual([1020, 1020, 1020, 1020]);

    // Part of #1, on time.
    await pay(admin, loan.id, 500, iso(-28));
    d = await reconciled(loan.id);
    expect(d.schedule[0]).toMatchObject({ paidAmount: 500, derivedStatus: 'OVERDUE' });

    // Rest of #1 plus part of #2, ten days late.
    await pay(admin, loan.id, 900, iso(-18));
    d = await reconciled(loan.id);
    expect(d.schedule.map((i) => i.paidAmount)).toEqual([1020, 380, 0, 0]);
    expect(d.schedule[0].paidDate?.slice(0, 10)).toBe(iso(-18));

    // Overpay the rest in one go: 4 080 − 1 400 = 2 680 owed, pay 2 700.
    await pay(admin, loan.id, 2700, iso(-1));
    d = await reconciled(loan.id);
    expect(d.status).toBe('CLOSED');
    expect(d.rollup.outstanding).toBe(0);
    expect(d.rollup.totalPaid).toBe(4100);
    expect(d.schedule.at(-1)!.paidAmount).toBe(1040); // the 20 overpaid sits on the last installment

    // Late payments lower the score but it stays a usable number.
    const r = await risk();
    expect(r.score).toBeLessThan(100);
    expect(r.score).toBeGreaterThan(0);
  });
});

describe('journey 3 — missed installment, capitalization, recovery', () => {
  it('re-amortizes the shortfall over the remaining installments and can still be repaid in full', async () => {
    // Daily, 24% flat, 10 000 over 10 days; #1 due 9 days ago.
    const loan = await createLoan(admin, customerId, {
      principal: 10000, annualRatePct: 24, frequency: 'DAILY', interestMethod: 'FLAT',
      installments: 10, disbursementDate: iso(-10), repaymentStartDate: iso(-9),
    });
    const before = await reconciled(loan.id);
    const first = before.schedule[0];
    await pay(admin, loan.id, 400, iso(-9), { installmentId: first.id });

    let d = await reconciled(loan.id);
    expect(d.schedule[0].actionRequired).toBe(true);
    const action = (await admin.get('/api/action-required')).body.installmentActions.find((a: { installmentId: string }) => a.installmentId === first.id);
    expect(action).toMatchObject({ kind: 'PARTIAL', remaining: round2(first.amountDue - 400) });

    const cap = await admin.post(`/api/installments/${first.id}/default`);
    expect(cap.status).toBe(200);
    const unpaid = round2(first.amountDue - 400);
    expect(cap.body).toMatchObject({ capitalized: unpaid, reamortized: 9, loanDefaulted: false });

    d = await reconciled(loan.id);
    const rest = d.schedule.slice(1);
    // New principal = 9 remaining principal slices + the capitalized shortfall.
    const expectedPrincipal = round2(sum(before.schedule.slice(1), (i) => i.principalComponent) + unpaid);
    expect(sum(rest, (i) => i.principalComponent)).toBeCloseTo(expectedPrincipal, 2);
    // Interest recomputed for the remaining 9 days at 24%: P × 0.24 × 9/365.
    expect(sum(rest, (i) => i.interestComponent)).toBeCloseTo(round2(expectedPrincipal * 0.24 * (9 / 365)), 2);
    expect(rest.map((i) => i.dueDate)).toEqual(before.schedule.slice(1).map((i) => i.dueDate));
    expect(d.schedule[0]).toMatchObject({ derivedStatus: 'DEFAULTED', paidAmount: 400, capitalizedAmount: unpaid });

    // Pay off everything that's left.
    const res = await pay(admin, loan.id, d.rollup.outstanding, iso(0));
    expect(res.status).toBe(201);
    d = await reconciled(loan.id);
    expect(d.status).toBe('CLOSED');
    expect(d.rollup.totalPaid).toBeCloseTo(400 + sum(rest, (i) => i.amountDue), 2);
  });

  it('capitalizing the last open installment defaults the loan', async () => {
    const loan = await createLoan(admin, customerId, {
      principal: 1000, annualRatePct: 0, frequency: 'DAILY', installments: 1,
      disbursementDate: iso(-6), repaymentStartDate: iso(-5),
    });
    const d = await getDetail(loan.id);
    const res = await admin.post(`/api/installments/${d.schedule[0].id}/default`);
    expect(res.body).toMatchObject({ capitalized: 1000, reamortized: 0, loanDefaulted: true });
    expect((await getDetail(loan.id)).status).toBe('DEFAULTED');
  });
});

describe('journey 4 — loan goes bad and is written off', () => {
  it('becomes default-eligible, is marked defaulted, stops taking payments, and moves to defaulted balance', async () => {
    const loan = await createLoan(admin, customerId, {
      principal: 6000, annualRatePct: 12, frequency: 'WEEKLY', interestMethod: 'FLAT',
      installments: 6, disbursementDate: iso(-20), repaymentStartDate: iso(-13),
    });
    let d = await reconciled(loan.id);
    expect(d.rollup.loanDefaultEligible).toBe(true); // 20 days with no payment ≥ 14-day weekly threshold
    const sheet = (await admin.get('/api/action-required')).body;
    expect(sheet.loanActions.map((a: { loanId: string }) => a.loanId)).toContain(loan.id);

    const outstanding = d.rollup.outstanding;
    expect((await admin.post(`/api/loans/${loan.id}/default`)).body.status).toBe('DEFAULTED');
    d = await reconciled(loan.id);
    expect(d.rollup.loanDefaultEligible).toBe(false);

    expect((await pay(admin, loan.id, 100)).status).toBe(400);
    expect((await admin.get('/api/collections/today')).body.items.some((i: { loanId: string }) => i.loanId === loan.id)).toBe(false);
    expect((await admin.get('/api/action-required')).body.total).toBe(0);

    const k = (await dashboard()).kpis;
    expect(k).toMatchObject({ outstanding: 0, overdueAmount: 0, defaultedLoans: 1 });
    expect(k.defaultedBalance).toBeCloseTo(outstanding, 2);
  });
});

describe('journey 5 — early settlement', () => {
  // 12 000 at 36.5% flat over 12 months (365/installment); #1 due 15 days ago.
  const settleable = () =>
    createLoan(admin, customerId, {
      principal: 12000, annualRatePct: 36.5, frequency: 'MONTHLY', interestMethod: 'FLAT',
      installments: 12, disbursementDate: iso(-45), repaymentStartDate: iso(-15),
    });

  it('quotes by hand-checkable figures, settles, and can be undone', async () => {
    const loan = await settleable();
    const d0 = await reconciled(loan.id);
    expect(d0.schedule[0].amountDue).toBe(1365);
    await pay(admin, loan.id, 1365, iso(-15));

    // Remaining principal 11 000; 15 days since the last due date at 0.1%/day → 165.
    const quote = (await admin.get(`/api/loans/${loan.id}/settlement`)).body;
    expect(quote).toMatchObject({ overdueDue: 0, remainingPrincipal: 11000, interestToDate: 165, settlementAmount: 11165 });

    const res = await admin.post(`/api/loans/${loan.id}/settlement`).send({ date: iso(0), mode: 'BANK' });
    expect(res.status).toBe(201);
    let d = await reconciled(loan.id);
    expect(d.status).toBe('CLOSED');
    expect(d.rollup.totalPaid).toBe(1365 + 11165);
    // 11 future installments each waive their 365 of scheduled interest.
    expect(sum(d.schedule, (i) => i.waivedAmount)).toBe(11 * 365);
    expect((await dashboard()).kpis.interestEarned).toBeCloseTo(365 + 165, 2);

    // Undo restores the pre-settlement position exactly.
    expect((await admin.delete(`/api/payments/${res.body.payment.id}`)).status).toBe(204);
    d = await reconciled(loan.id);
    expect(d.status).toBe('ACTIVE');
    expect(d.schedule.map((i) => i.paidAmount)).toEqual([1365, ...Array(11).fill(0)]);
    expect(sum(d.schedule, (i) => i.waivedAmount)).toBe(0);
    expect((await dashboard()).kpis.interestEarned).toBeCloseTo(365, 2);
  });

  it('includes overdue installments in full when settling a loan in arrears', async () => {
    const loan = await settleable();
    const quote = (await admin.get(`/api/loans/${loan.id}/settlement`)).body;
    // #1 (1 365) is overdue; 11 000 future principal; 15 days of interest on it.
    expect(quote).toMatchObject({ overdueDue: 1365, remainingPrincipal: 11000, interestToDate: 165, settlementAmount: 12530 });
    await admin.post(`/api/loans/${loan.id}/settlement`).send({ date: iso(0) });
    const d = await reconciled(loan.id);
    expect(d.rollup.totalPaid).toBe(12530);
  });
});

describe('journey 6 — correcting payment history', () => {
  it('re-allocates oldest-first after every edit and delete', async () => {
    // Five installments of 1 000 at 0%, all past due.
    const loan = await createLoan(admin, customerId, {
      principal: 5000, annualRatePct: 0, frequency: 'WEEKLY', installments: 5,
      disbursementDate: iso(-40), repaymentStartDate: iso(-35),
    });
    // Expected paid per installment from total cash, filling oldest first.
    const expectFill = async (total: number) => {
      const d = await reconciled(loan.id);
      expect(d.schedule.map((i) => i.paidAmount)).toEqual(d.schedule.map((_, k) => Math.min(1000, Math.max(0, total - k * 1000))));
    };

    const a = (await pay(admin, loan.id, 700, iso(-30))).body;
    const b = (await pay(admin, loan.id, 900, iso(-20))).body;
    const c = (await pay(admin, loan.id, 1250, iso(-10))).body;
    await expectFill(2850);

    await admin.put(`/api/payments/${b.id}`).send({ amount: 400, date: iso(-20), mode: 'UPI' });
    await expectFill(2350);
    await admin.put(`/api/payments/${a.id}`).send({ amount: 700, date: iso(-5) }); // move later in time
    await expectFill(2350);
    await admin.delete(`/api/payments/${c.id}`);
    await expectFill(1100);
    await pay(admin, loan.id, 3900);
    await expectFill(5000);
    expect((await getDetail(loan.id)).status).toBe('CLOSED');
    await admin.delete(`/api/payments/${a.id}`);
    await expectFill(4300);
    expect((await getDetail(loan.id)).status).toBe('ACTIVE');
  });
});

describe('journey 7 — grace and default settings', () => {
  it('per-loan overrides and loan-type settings decide when action is required', async () => {
    // Both daily loans have #1 due 4 days ago; default daily grace is 2 days.
    const terms = { principal: 1000, annualRatePct: 0, frequency: 'DAILY', installments: 10, disbursementDate: iso(-5), repaymentStartDate: iso(-4) };
    const normal = await createLoan(admin, customerId, terms);
    const lenient = await createLoan(admin, customerId, { ...terms, graceDaysOverride: 10, defaultThresholdDaysOverride: 30 });

    const flagged = async () =>
      new Set((await admin.get('/api/action-required')).body.installmentActions.map((a: { loanId: string }) => a.loanId));
    expect(await flagged()).toEqual(new Set([normal.id]));
    expect((await getDetail(lenient.id)).rollup.loanDefaultEligible).toBe(false);
    // No payment for 5 days meets the 5-day daily default threshold; the override raises it to 30.
    expect((await getDetail(normal.id)).rollup.loanDefaultEligible).toBe(true);
  });

  it('changing the loan-type grace applies to loans without an override', async () => {
    const loan = await createLoan(admin, customerId, {
      principal: 1000, annualRatePct: 0, frequency: 'DAILY', installments: 10,
      disbursementDate: iso(-4), repaymentStartDate: iso(-3),
    });
    expect((await getDetail(loan.id)).schedule[0].actionRequired).toBe(true); // 3 days > 2
    await admin.put('/api/config').send({ loanTypes: [{ frequency: 'DAILY', graceDays: 5, defaultThresholdDays: 10 }] });
    expect((await getDetail(loan.id)).schedule[0].actionRequired).toBe(false);
  });
});

describe('journey 8 — customer across several loans', () => {
  it('customer totals add up across loans of different types', async () => {
    const a = await createLoan(admin, customerId, { principal: 2000, annualRatePct: 0, frequency: 'WEEKLY', installments: 2, disbursementDate: iso(-10), repaymentStartDate: iso(-7) });
    const b = await createLoan(admin, customerId, { principal: 3000, annualRatePct: 0, frequency: 'MONTHLY', installments: 3, disbursementDate: iso(-1), repaymentStartDate: iso(29) });
    await pay(admin, a.id, 1500, iso(-1));
    await pay(admin, b.id, 500, iso(0));

    const detail = (await admin.get(`/api/customers/${customerId}`)).body;
    expect(detail.loans).toHaveLength(2);
    expect(detail.totals).toMatchObject({ disbursed: 5000, collected: 2000, outstanding: 3000, overdue: 0 });
    const list = (await admin.get('/api/customers')).body.find((c: { id: string }) => c.id === customerId);
    expect(list.loanCount).toBe(2);
  });
});
