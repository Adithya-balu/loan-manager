import { beforeEach, describe, expect, it } from 'vitest';
import { type Client, createCustomer, createLoan, getLoan, iso, login, pay, resetDb } from './helpers.js';

let admin: Client;
let customerId: string;

beforeEach(async () => {
  await resetDb();
  admin = await login();
  customerId = (await createCustomer(admin)).id;
});

/** Daily 0% loan, 12 installments from 10 days ago: #1–#7 are past the 2-day grace. */
const overdueLoan = async () =>
  (
    await createLoan(admin, customerId, {
      principal: 1200, annualRatePct: 0, frequency: 'DAILY', installments: 12,
      disbursementDate: iso(-11), repaymentStartDate: iso(-10),
    })
  ).id;

describe('payments only on active loans (#7, decision A)', () => {
  it('rejects payments on a CLOSED loan', async () => {
    const id = await overdueLoan();
    await pay(admin, id, 1200);
    expect((await getLoan(admin, id)).status).toBe('CLOSED');
    const res = await pay(admin, id, 10);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/active loans/i);
  });

  it('rejects payments on a DEFAULTED loan', async () => {
    const id = await overdueLoan();
    await admin.post(`/api/loans/${id}/default`);
    const res = await pay(admin, id, 10);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/active loans/i);
  });
});

describe('no future-dated money movements (#7)', () => {
  it('rejects future payment, edit and settlement dates', async () => {
    const id = await overdueLoan();
    const future = await pay(admin, id, 10, iso(1));
    expect(future.status).toBe(400);
    expect(future.body.error).toMatch(/future/i);

    const ok = (await pay(admin, id, 10)).body;
    expect((await admin.put(`/api/payments/${ok.id}`).send({ amount: 10, date: iso(2) })).status).toBe(400);

    const settle = await admin.post(`/api/loans/${id}/settlement`).send({ date: iso(3) });
    expect(settle.status).toBe(400);
    expect(settle.body.error).toMatch(/future/i);
  });

  it('still allows quoting a future settlement date', async () => {
    const id = await overdueLoan();
    expect((await admin.get(`/api/loans/${id}/settlement?date=${iso(5)}`)).status).toBe(200);
  });
});

describe('capitalize / default only when action is required (#7)', () => {
  it('rejects an installment still inside its grace period or not yet due', async () => {
    const id = await overdueLoan();
    const d = await getLoan(admin, id);
    for (const inst of [d.schedule[9], d.schedule[11]]) {
      const res = await admin.post(`/api/installments/${inst.id}/default`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/grace/i);
    }
    expect((await getLoan(admin, id)).status).toBe('ACTIVE');
  });

  it('rejects installments on a loan that is not ACTIVE', async () => {
    const id = await overdueLoan();
    await admin.post(`/api/loans/${id}/default`);
    const d = await getLoan(admin, id);
    expect((await admin.post(`/api/installments/${d.schedule[0].id}/default`)).status).toBe(400);
  });
});

describe('mark loan defaulted (decision D: manual override, ACTIVE only)', () => {
  it('allows an admin to default a healthy ACTIVE loan, but not a CLOSED one', async () => {
    const healthy = await createLoan(admin, customerId);
    expect((await admin.post(`/api/loans/${healthy.id}/default`)).body.status).toBe('DEFAULTED');
    expect((await admin.post(`/api/loans/${healthy.id}/default`)).status).toBe(400);

    const id = await overdueLoan();
    await pay(admin, id, 1200);
    expect((await admin.post(`/api/loans/${id}/default`)).status).toBe(400);
  });
});

describe('loan terms (#7)', () => {
  it('rejects a repayment start before disbursement', async () => {
    const res = await admin.post('/api/loans').send({
      customerId, principal: 1000, annualRatePct: 12, frequency: 'MONTHLY', interestMethod: 'FLAT',
      installments: 2, disbursementDate: iso(10), repaymentStartDate: iso(0),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/repayment start/i);
  });

  it('only allows editing ACTIVE loans', async () => {
    const loan = await createLoan(admin, customerId);
    await admin.post(`/api/loans/${loan.id}/default`);
    const res = await admin.put(`/api/loans/${loan.id}`).send({
      customerId, principal: 5000, annualRatePct: 12, frequency: 'WEEKLY', interestMethod: 'FLAT',
      installments: 5, disbursementDate: iso(0), repaymentStartDate: iso(7),
    });
    expect(res.status).toBe(400);
  });
});

describe('customer delete (decision C: block when loans exist)', () => {
  it('refuses with a clear message and keeps the customer', async () => {
    await createLoan(admin, customerId);
    const res = await admin.delete(`/api/customers/${customerId}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/has 1 loan/);
    expect((await admin.get(`/api/customers/${customerId}`)).status).toBe(200);
  });
});
