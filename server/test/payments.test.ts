import { beforeEach, describe, expect, it } from 'vitest';
import { type Client, createCustomer, createLoan, getLoan, iso, login, paidAmounts, pay, resetDb } from './helpers.js';

let admin: Client;
let loanId: string;
let customerId: string;

// Four weekly installments of 1 000 at 0%; #1 and #2 are already past due.
beforeEach(async () => {
  await resetDb();
  admin = await login();
  customerId = (await createCustomer(admin)).id;
  loanId = (
    await createLoan(admin, customerId, {
      principal: 4000, annualRatePct: 0, installments: 4, disbursementDate: iso(-20), repaymentStartDate: iso(-14),
    })
  ).id;
});

describe('payment validation', () => {
  it('rejects negative amounts and dates before disbursement', async () => {
    expect((await pay(admin, loanId, -5)).status).toBe(400);
    const early = await pay(admin, loanId, 100, iso(-30));
    expect(early.status).toBe(400);
    expect(early.body.error).toMatch(/disbursement/);
  });

  it('requires collecting the oldest open installment first', async () => {
    const d = await getLoan(admin, loanId);
    const res = await pay(admin, loanId, 1000, iso(0), { installmentId: d.schedule[1].id });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/#1/);
  });
});

describe('allocation', () => {
  it('handles partial payments and spills into the next installment', async () => {
    const d0 = await getLoan(admin, loanId);
    const p1 = await pay(admin, loanId, 400, iso(-1), { installmentId: d0.schedule[0].id, mode: 'UPI' });
    expect(p1.status).toBe(201);
    expect(p1.body.installmentId).toBe(d0.schedule[0].id);
    expect(paidAmounts(await getLoan(admin, loanId))).toEqual([400, 0, 0, 0]);

    await pay(admin, loanId, 1100);
    const d = await getLoan(admin, loanId);
    expect(paidAmounts(d)).toEqual([1000, 500, 0, 0]);
    expect(d.rollup.totalPaid).toBeCloseTo(1500);
    expect(d.rollup.outstanding).toBeCloseTo(2500);
  });

  it('replays oldest-first after edit and delete', async () => {
    const p1 = (await pay(admin, loanId, 400, iso(-1))).body;
    const p2 = (await pay(admin, loanId, 1100)).body;

    expect((await admin.put(`/api/payments/${p1.id}`).send({ amount: 1000, date: iso(-1) })).status).toBe(200);
    expect(paidAmounts(await getLoan(admin, loanId))).toEqual([1000, 1000, 100, 0]);
    expect((await admin.put(`/api/payments/${p1.id}`).send({ amount: 1000, date: iso(-40) })).status).toBe(400);

    expect((await admin.delete(`/api/payments/${p2.id}`)).status).toBe(204);
    expect(paidAmounts(await getLoan(admin, loanId))).toEqual([1000, 0, 0, 0]);
  });

  it('closes the loan when fully paid and reopens it when a payment is removed', async () => {
    const p = (await pay(admin, loanId, 4500)).body;
    let d = await getLoan(admin, loanId);
    expect(d.status).toBe('CLOSED');
    expect(d.rollup.outstanding).toBe(0);
    await admin.delete(`/api/payments/${p.id}`);
    d = await getLoan(admin, loanId);
    expect(d.status).toBe('ACTIVE');
  });

  it('filters the payment list by loan and customer', async () => {
    await pay(admin, loanId, 100);
    const byLoan = await admin.get(`/api/payments?loanId=${loanId}`);
    expect(byLoan.body.every((p: { loanId: string }) => p.loanId === loanId)).toBe(true);
    expect(byLoan.body[0].customer.name).toBeTruthy();
    expect((await admin.get(`/api/payments?customerId=${customerId}`)).body).toHaveLength(1);
  });
});

describe('long loans', () => {
  it('replays 100 payments on a 200-installment daily loan quickly and correctly', async () => {
    const L = await createLoan(admin, customerId, {
      principal: 20000, annualRatePct: 0, frequency: 'DAILY', installments: 200,
      disbursementDate: iso(-150), repaymentStartDate: iso(-140),
    });
    const ids: string[] = [];
    for (let i = 0; i < 100; i++) ids.push((await pay(admin, L.id, 100, iso(-139 + i))).body.id);
    expect(paidAmounts(await getLoan(admin, L.id)).filter((x) => x === 100)).toHaveLength(100);

    const started = Date.now();
    expect((await admin.delete(`/api/payments/${ids[0]}`)).status).toBe(204);
    expect(Date.now() - started).toBeLessThan(3000);
    const d = await getLoan(admin, L.id);
    expect(d.rollup.totalPaid).toBeCloseTo(9900);
    expect(paidAmounts(d).slice(0, 99).every((x) => x === 100)).toBe(true);
    expect(paidAmounts(d)[99]).toBe(0);
  }, 60000);
});
