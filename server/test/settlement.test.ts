import { beforeEach, describe, expect, it } from 'vitest';
import { type Client, createCustomer, createLoan, getLoan, iso, login, pay, resetDb } from './helpers.js';

let admin: Client;
let customerId: string;
let loanId: string;

// 36.5% a year → 0.1% a day → ₹10/day interest on 10 000; disbursed 10 days ago.
beforeEach(async () => {
  await resetDb();
  admin = await login();
  customerId = (await createCustomer(admin)).id;
  loanId = (
    await createLoan(admin, customerId, {
      principal: 10000, annualRatePct: 36.5, frequency: 'MONTHLY', installments: 10,
      disbursementDate: iso(-10), repaymentStartDate: iso(20),
    })
  ).id;
});

describe('settlement quote', () => {
  it('quotes interest to date, and re-quotes for another date', async () => {
    const today = await admin.get(`/api/loans/${loanId}/settlement`);
    expect(today.body).toMatchObject({ asOf: iso(0) });
    expect(today.body.interestToDate).toBeCloseTo(100, 1);
    expect(today.body.remainingPrincipal).toBeCloseTo(10000, 1);

    const later = await admin.get(`/api/loans/${loanId}/settlement?date=${iso(5)}`);
    expect(later.body).toMatchObject({ asOf: iso(5) });
    expect(later.body.interestToDate).toBeCloseTo(150, 1);

    expect((await admin.get(`/api/loans/${loanId}/settlement?date=31-12-2026`)).status).toBe(400);
  });

  it('includes overdue installments and future principal', async () => {
    const L = await createLoan(admin, customerId, {
      principal: 3000, annualRatePct: 0, installments: 3, disbursementDate: iso(-20), repaymentStartDate: iso(-7),
    });
    await pay(admin, L.id, 500, iso(-1));
    const q = await admin.get(`/api/loans/${L.id}/settlement`);
    expect(q.body).toMatchObject({ overdueDue: 1500, remainingPrincipal: 1000, settlementAmount: 2500 });
  });
});

describe('settle', () => {
  it('settles for the quoted date and closes the loan', async () => {
    expect((await admin.post(`/api/loans/${loanId}/settlement`).send({ date: iso(-20) })).status).toBe(400);
    const quote = (await admin.get(`/api/loans/${loanId}/settlement`)).body;
    const res = await admin.post(`/api/loans/${loanId}/settlement`).send({ date: iso(0), mode: 'BANK' });
    expect(res.status).toBe(201);
    expect(res.body.payment.amount).toBeCloseTo(quote.settlementAmount, 2);

    const d = await getLoan(admin, loanId);
    expect(d.status).toBe('CLOSED');
    expect(d.schedule.every((i) => i.derivedStatus === 'PAID')).toBe(true);
    expect(d.rollup.outstanding).toBe(0);
    expect((await admin.post(`/api/loans/${loanId}/settlement`).send({ date: iso(0) })).status).toBe(400);
  });
});
