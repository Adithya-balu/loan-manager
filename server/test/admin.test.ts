import { beforeAll, describe, expect, it } from 'vitest';
import { type Client, createCustomer, createLoan, iso, login, pay, resetDb } from './helpers.js';

let admin: Client;
beforeAll(async () => {
  await resetDb();
  admin = await login();
});

describe('dashboard', () => {
  it('returns KPIs and six months of revenue', async () => {
    const c = await createCustomer(admin);
    const loan = await createLoan(admin, c.id, { disbursementDate: iso(-10), repaymentStartDate: iso(-3) });
    await pay(admin, loan.id, 500);
    const res = await admin.get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.trend).toHaveLength(6);
    expect(res.body.trend[0]).toHaveProperty('revenue');
    expect(res.body.kpis.activeLoans).toBe(1);
    expect(res.body.kpis.collectionEfficiency).toBeGreaterThanOrEqual(0);
    expect(res.body.kpis.collectionEfficiency).toBeLessThanOrEqual(100);
    expect(res.body.collections.today).toBeCloseTo(500);
  });
});

describe('dashboard and defaulted loans (#9, decision B)', () => {
  it('keeps defaulted balances out of Outstanding/Overdue and reports them separately', async () => {
    const before = (await admin.get('/api/dashboard')).body.kpis;
    const c = await createCustomer(admin);
    const bad = await createLoan(admin, c.id, {
      principal: 1000, annualRatePct: 0, frequency: 'DAILY', installments: 10,
      disbursementDate: iso(-6), repaymentStartDate: iso(-5),
    });
    const owed = (await admin.get(`/api/loans/${bad.id}`)).body.rollup;
    await admin.post(`/api/loans/${bad.id}/default`);

    const k = (await admin.get('/api/dashboard')).body.kpis;
    expect(k.outstanding).toBeCloseTo(before.outstanding, 2);
    expect(k.overdueAmount).toBeCloseTo(before.overdueAmount, 2);
    expect(k.defaultedBalance).toBeCloseTo((before.defaultedBalance ?? 0) + owed.outstanding, 2);
  });
});

describe('settings', () => {
  it('reads, updates and validates loan-type settings', async () => {
    const orig = (await admin.get('/api/config')).body.loanTypes;
    expect(orig).toHaveLength(3);
    expect((await admin.put('/api/config').send({ loanTypes: [{ frequency: 'DAILY', graceDays: 9, defaultThresholdDays: 20 }] })).status).toBe(200);
    const daily = (await admin.get('/api/config')).body.loanTypes.find((t: { frequency: string }) => t.frequency === 'DAILY');
    expect(daily.graceDays).toBe(9);
    expect((await admin.put('/api/config').send({ loanTypes: [{ frequency: 'DAILY', graceDays: -1, defaultThresholdDays: 1 }] })).status).toBe(400);
    await admin.put('/api/config').send({ loanTypes: orig });
  });
});

describe('company profile', () => {
  it('reads (auto-creating), updates, validates and uploads a logo', async () => {
    expect((await admin.get('/api/company')).body.name).toBeTruthy();
    const res = await admin.put('/api/company').send({ name: 'Test Finance', phone: '044', email: '', address: 'Street' });
    expect(res.body).toMatchObject({ name: 'Test Finance', email: null });
    expect((await admin.put('/api/company').send({ name: '' })).status).toBe(400);
    const logo = await admin
      .post('/api/company/logo')
      .attach('file', Buffer.from('<svg/>'), { filename: 'logo.svg', contentType: 'image/svg+xml' });
    expect(logo.status).toBe(201);
    expect(logo.body.logoUrl).toBeTruthy();
  });
});
