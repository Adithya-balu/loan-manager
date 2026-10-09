import { beforeEach, describe, expect, it } from 'vitest';
import { type Client, createCustomer, createLoan, getLoan, iso, login, paidAmounts, pay, resetDb } from './helpers.js';

let admin: Client;
let customerId: string;

beforeEach(async () => {
  await resetDb();
  admin = await login();
  customerId = (await createCustomer(admin)).id;
});

/** Four weekly installments of 1 000 at 0%, the first three already overdue. */
async function overdueLoan() {
  return (
    await createLoan(admin, customerId, {
      principal: 4000, annualRatePct: 0, installments: 4, disbursementDate: iso(-30), repaymentStartDate: iso(-21),
    })
  ).id;
}

describe('payment replay after capitalization (#1)', () => {
  it('does not double-count money held by a capitalized installment when a later payment is deleted', async () => {
    const loanId = await overdueLoan();
    await pay(admin, loanId, 400, iso(-20));
    const before = await getLoan(admin, loanId);
    expect((await admin.post(`/api/installments/${before.schedule[0].id}/default`)).status).toBe(200);
    const later = (await pay(admin, loanId, 100, iso(-1))).body;

    expect((await admin.delete(`/api/payments/${later.id}`)).status).toBe(204);
    const d = await getLoan(admin, loanId);
    expect(paidAmounts(d)[0]).toBe(400);
    expect(paidAmounts(d).slice(1)).toEqual([0, 0, 0]);
    expect(d.rollup.totalPaid).toBeCloseTo(400);
  });

  it('keeps balances when a later payment is edited', async () => {
    const loanId = await overdueLoan();
    await pay(admin, loanId, 400, iso(-20));
    const d0 = await getLoan(admin, loanId);
    await admin.post(`/api/installments/${d0.schedule[0].id}/default`);
    const later = (await pay(admin, loanId, 100, iso(-1))).body;
    const outstandingBefore = (await getLoan(admin, loanId)).rollup.outstanding;

    const edit = await admin.put(`/api/payments/${later.id}`).send({ amount: 300, date: iso(-1) });
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);
    const d = await getLoan(admin, loanId);
    expect(paidAmounts(d)[0]).toBe(400);
    expect(d.rollup.totalPaid).toBeCloseTo(700);
    expect(d.rollup.outstanding).toBeCloseTo(outstandingBefore - 200, 1);
  });

  it('refuses to shrink a payment that was absorbed by a capitalized installment', async () => {
    const loanId = await overdueLoan();
    const first = (await pay(admin, loanId, 400, iso(-20))).body;
    const d0 = await getLoan(admin, loanId);
    await admin.post(`/api/installments/${d0.schedule[0].id}/default`);

    const res = await admin.put(`/api/payments/${first.id}`).send({ amount: 100, date: iso(-20) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/capitalized/i);
    expect((await admin.delete(`/api/payments/${first.id}`)).status).toBe(400);
    expect(paidAmounts(await getLoan(admin, loanId))[0]).toBe(400);
  });
});

// 10 000 over 10 monthly installments at 24% flat → 200 interest each; disbursed 10 days ago.
async function settledLoan() {
  const loanId = (
    await createLoan(admin, customerId, {
      principal: 10000, annualRatePct: 24, frequency: 'MONTHLY', installments: 10,
      disbursementDate: iso(-10), repaymentStartDate: iso(20),
    })
  ).id;
  const res = await admin.post(`/api/loans/${loanId}/settlement`).send({ date: iso(0) });
  expect(res.status).toBe(201);
  return { loanId, payment: res.body.payment, quote: res.body.quote };
}

describe('settlement payments (#2)', () => {
  it('are tagged as SETTLEMENT and cannot be edited', async () => {
    const { loanId, payment } = await settledLoan();
    expect(payment.kind).toBe('SETTLEMENT');
    const res = await admin.put(`/api/payments/${payment.id}`).send({ amount: payment.amount, date: iso(0), note: 'note' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/re-settle/i);
    expect((await getLoan(admin, loanId)).status).toBe('CLOSED');
  });

  it('can be deleted to undo the settlement, restoring the full schedule', async () => {
    const { loanId, payment } = await settledLoan();
    expect((await admin.delete(`/api/payments/${payment.id}`)).status).toBe(204);
    const d = await getLoan(admin, loanId);
    expect(d.status).toBe('ACTIVE');
    expect(d.rollup.totalPaid).toBe(0);
    expect(d.rollup.outstanding).toBeCloseTo(d.rollup.totalPayable, 1);
  });

  it('locks the regular payments of a settled loan', async () => {
    const loanId = (
      await createLoan(admin, customerId, { principal: 3000, annualRatePct: 0, installments: 3, disbursementDate: iso(-20), repaymentStartDate: iso(-7) })
    ).id;
    const regular = (await pay(admin, loanId, 500, iso(-1))).body;
    await admin.post(`/api/loans/${loanId}/settlement`).send({ date: iso(0) });
    expect((await admin.put(`/api/payments/${regular.id}`).send({ amount: 600, date: iso(-1) })).status).toBe(400);
    expect((await admin.delete(`/api/payments/${regular.id}`)).status).toBe(400);
  });

  it('settlement after partial payments restores those payments on undo', async () => {
    const loanId = (
      await createLoan(admin, customerId, { principal: 3000, annualRatePct: 0, installments: 3, disbursementDate: iso(-20), repaymentStartDate: iso(-7) })
    ).id;
    await pay(admin, loanId, 500, iso(-1));
    const settle = (await admin.post(`/api/loans/${loanId}/settlement`).send({ date: iso(0) })).body;
    await admin.delete(`/api/payments/${settle.payment.id}`);
    const d = await getLoan(admin, loanId);
    expect(paidAmounts(d)).toEqual([500, 0, 0]);
    expect(d.status).toBe('ACTIVE');
  });
});

describe('settlement accounting (#6)', () => {
  it('reports cash collected, not the waived schedule', async () => {
    const { loanId, quote } = await settledLoan();
    const d = await getLoan(admin, loanId);
    expect(d.rollup.totalPaid).toBeCloseTo(quote.settlementAmount, 2);
    expect(d.rollup.outstanding).toBe(0);
  });

  it('books only interest actually earned as revenue', async () => {
    const { quote } = await settledLoan();
    // Nothing had matured, so earned interest is exactly the interest-to-date.
    const dash = (await admin.get('/api/dashboard')).body;
    expect(dash.kpis.interestEarned).toBeCloseTo(quote.interestToDate, 2);
    const thisMonth = dash.trend.at(-1);
    expect(thisMonth.revenue).toBeCloseTo(quote.interestToDate, 2);
  });

  it('customer totals use cash collected', async () => {
    const { quote } = await settledLoan();
    const detail = (await admin.get(`/api/customers/${customerId}`)).body;
    expect(detail.totals.collected).toBeCloseTo(quote.settlementAmount, 2);
  });
});
