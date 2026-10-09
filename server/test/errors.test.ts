import { beforeAll, describe, expect, it } from 'vitest';
import { type Client, app, createCustomer, createLoan, iso, login, resetDb } from './helpers.js';
import request from 'supertest';

let admin: Client;
beforeAll(async () => {
  await resetDb();
  admin = await login();
});

const noInternals = (body: unknown) => {
  const text = JSON.stringify(body);
  expect(text).not.toMatch(/prisma|invocation|\.ts:|node_modules/i);
};

describe('not found → 404 (#8)', () => {
  it.each([
    ['get', '/api/customers/missing'],
    ['get', '/api/loans/missing'],
    ['get', '/api/loans/missing/settlement'],
    ['delete', '/api/payments/missing'],
  ] as const)('%s %s', async (method, path) => {
    const res = await admin[method](path);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });

  it('payment for an unknown loan', async () => {
    const res = await admin.post('/api/payments').send({ loanId: 'missing', amount: 10, date: iso(0) });
    expect(res.status).toBe(404);
    noInternals(res.body);
  });
});

describe('validation errors are readable (#8)', () => {
  it('uses the schema message for custom messages', async () => {
    const res = await admin.post('/api/customers').send({ name: 'X', mobile: '1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Mobile number must be exactly 10 digits');
  });

  it('names missing fields', async () => {
    const res = await admin.post('/api/customers').send({ mobile: '9876543210' });
    expect(res.body.error).toBe('Name is required');
  });

  it('names the field for generic messages', async () => {
    const c = await createCustomer(admin);
    const res = await admin.post('/api/loans').send({
      customerId: c.id, principal: 1000, annualRatePct: 12, frequency: 'MONTHLY', interestMethod: 'FLAT',
      installments: 2.5, disbursementDate: iso(0), repaymentStartDate: iso(30),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^Installments: /);
    expect(res.body.error).not.toMatch(/^\[/);
  });

  it('rejects malformed JSON cleanly', async () => {
    const res = await admin.post('/api/customers').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Malformed JSON body');
  });
});

describe('database errors do not leak (#8)', () => {
  it('raw Prisma messages never reach the client', async () => {
    const c = await createCustomer(admin);
    await createLoan(admin, c.id);
    noInternals((await admin.delete(`/api/customers/${c.id}`)).body);
    noInternals((await admin.get('/api/loans/missing')).body);
  });

  it('health still works without auth', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
  });
});
