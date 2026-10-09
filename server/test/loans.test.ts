import { beforeAll, describe, expect, it } from 'vitest';
import { type Client, createCustomer, createLoan, getLoan, iso, login, pay, resetDb } from './helpers.js';

let admin: Client;
let customerId: string;
beforeAll(async () => {
  await resetDb();
  admin = await login();
  customerId = (await createCustomer(admin)).id;
});

const terms = {
  principal: 12000,
  annualRatePct: 12,
  frequency: 'MONTHLY',
  interestMethod: 'REDUCING',
  installments: 12,
  repaymentStartDate: iso(30),
};
const sum = (rows: Record<string, number>[], key: string) => rows.reduce((s, r) => s + r[key], 0);

describe('schedule preview', () => {
  it('reducing schedule repays the principal and ends at zero', async () => {
    const res = await admin.post('/api/loans/preview').send(terms);
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(12);
    expect(sum(res.body.rows, 'principalComponent')).toBeCloseTo(12000, 1);
    expect(res.body.rows.at(-1).closingBalance).toBeCloseTo(0, 1);
  });

  it.each(['DAILY', 'WEEKLY', 'MONTHLY'].flatMap((f) => ['FLAT', 'REDUCING'].map((m) => [f, m])))(
    '%s / %s totals are consistent',
    async (frequency, interestMethod) => {
      const res = await admin.post('/api/loans/preview').send({ ...terms, frequency, interestMethod });
      expect(sum(res.body.rows, 'amountDue')).toBeCloseTo(res.body.totalPayable, 1);
    },
  );

  it('handles a 0% rate', async () => {
    const res = await admin.post('/api/loans/preview').send({ ...terms, annualRatePct: 0 });
    expect(res.body.totalInterest).toBeCloseTo(0);
  });
});

describe('loan create / edit', () => {
  it.each([
    [{ principal: 0 }],
    [{ installments: 0 }],
    [{ customerId: 'missing' }],
  ])('rejects invalid input %j', async (bad) => {
    const res = await admin.post('/api/loans').send({ customerId, disbursementDate: iso(0), ...terms, ...bad });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('saves disbursement mode + guarantor, and outstanding equals total payable', async () => {
    const loan = await createLoan(admin, customerId, {
      ...terms,
      disbursementMode: 'UPI',
      guarantorName: 'Ravi',
      guarantorMobile: '9876543210',
      guarantorRelation: 'Brother',
    });
    const d = await getLoan(admin, loan.id);
    expect(d).toMatchObject({ status: 'ACTIVE', disbursementMode: 'UPI', guarantorName: 'Ravi' });
    expect(d.rollup.outstanding).toBeCloseTo(d.rollup.totalPayable, 1);
    expect(d.rollup.overdueAmount).toBe(0);
  });

  it('editing before any payment regenerates the schedule', async () => {
    const loan = await createLoan(admin, customerId);
    const res = await admin.put(`/api/loans/${loan.id}`).send({
      customerId, principal: 6000, annualRatePct: 12, frequency: 'WEEKLY', interestMethod: 'FLAT',
      installments: 6, disbursementDate: iso(0), repaymentStartDate: iso(7), guarantorName: null,
    });
    expect(res.status).toBe(200);
    expect(res.body.schedule).toHaveLength(6);
  });

  it('locks loan terms once a payment exists', async () => {
    const loan = await createLoan(admin, customerId, { disbursementDate: iso(-1) });
    await pay(admin, loan.id, 100);
    const res = await admin.put(`/api/loans/${loan.id}`).send({
      customerId, principal: 1, annualRatePct: 0, frequency: 'WEEKLY', interestMethod: 'FLAT',
      installments: 1, disbursementDate: iso(0), repaymentStartDate: iso(1),
    });
    expect(res.status).toBe(400);
  });

  it('deleting a loan removes its payments', async () => {
    const loan = await createLoan(admin, customerId, { disbursementDate: iso(-3) });
    await pay(admin, loan.id, 100);
    expect((await admin.delete(`/api/loans/${loan.id}`)).status).toBe(204);
    expect((await admin.get(`/api/payments?loanId=${loan.id}`)).body).toHaveLength(0);
  });
});

describe('loan documents', () => {
  it('uploads, serves, lists and deletes', async () => {
    const loan = await createLoan(admin, customerId);
    const up = await admin
      .post(`/api/loans/${loan.id}/documents`)
      .field('label', 'Agreement')
      .attach('file', Buffer.from('hello'), { filename: 'agreement.txt', contentType: 'text/plain' });
    expect(up.status).toBe(201);
    expect(up.body.label).toBe('Agreement');
    expect((await admin.get(up.body.url)).status).toBe(200);
    expect((await getLoan(admin, loan.id) as unknown as { documents: { id: string }[] }).documents.map((d) => d.id)).toContain(up.body.id);
    expect((await admin.delete(`/api/loans/${loan.id}/documents/${up.body.id}`)).status).toBe(204);
    expect((await admin.post(`/api/loans/${loan.id}/documents`)).status).toBe(400);
  });
});
