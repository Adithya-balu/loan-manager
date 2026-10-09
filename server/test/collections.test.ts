import { beforeEach, describe, expect, it } from 'vitest';
import { type Client, createCustomer, createLoan, getLoan, iso, login, resetDb } from './helpers.js';

let admin: Client;
let loanId: string;

// 12 daily installments of ~83.33 at 0% starting 10 days ago: #1–#10 overdue,
// #11 due today, #12 tomorrow. Daily grace defaults to 2 days.
beforeEach(async () => {
  await resetDb();
  admin = await login();
  const c = await createCustomer(admin);
  loanId = (
    await createLoan(admin, c.id, {
      principal: 1000, annualRatePct: 0, frequency: 'DAILY', installments: 12,
      disbursementDate: iso(-11), repaymentStartDate: iso(-10),
    })
  ).id;
});

type Item = { loanId: string; sequence: number; dueDate: string; blockedBySequence: number | null; daysPastDue: number };

describe("today's collection", () => {
  it('lists overdue + today items with exactly one collectable per loan', async () => {
    const res = await admin.get('/api/collections/today');
    const mine: Item[] = res.body.items.filter((i: Item) => i.loanId === loanId);
    expect(mine.length).toBe(11);
    expect(mine.filter((i) => i.blockedBySequence === null).map((i) => i.sequence)).toEqual([1]);
  });

  it('still flags the blocked item when overdue rows are hidden', async () => {
    const res = await admin.get('/api/collections/today?includeOverdue=false');
    const mine: Item[] = res.body.items.filter((i: Item) => i.loanId === loanId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ dueDate: iso(0), blockedBySequence: 1 });
  });
});

describe('action required', () => {
  it('lists installments past grace and default-eligible loans', async () => {
    const res = await admin.get('/api/action-required');
    const acts: Item[] = res.body.installmentActions.filter((a: Item) => a.loanId === loanId);
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.every((a) => a.daysPastDue > 2)).toBe(true);
    expect(res.body.loanActions.map((a: Item) => a.loanId)).toContain(loanId);
    expect(res.body.total).toBe(res.body.installmentActions.length + res.body.loanActions.length);
  });

  it('flags every action item except the oldest per loan as blocked (#5)', async () => {
    const res = await admin.get('/api/action-required');
    const acts: Item[] = res.body.installmentActions
      .filter((a: Item) => a.loanId === loanId)
      .sort((a: Item, b: Item) => a.sequence - b.sequence);
    expect(acts.length).toBeGreaterThan(1);
    expect(acts[0].blockedBySequence).toBeNull();
    expect(acts.slice(1).every((a) => a.blockedBySequence === 1)).toBe(true);
  });

  it('defaulting an overdue installment re-amortizes without changing the balance (0%)', async () => {
    const before = await getLoan(admin, loanId);
    expect((await admin.post(`/api/installments/${before.schedule[0].id}/default`)).status).toBe(200);
    const after = await getLoan(admin, loanId);
    expect(after.schedule[0].derivedStatus).toBe('DEFAULTED');
    expect(after.rollup.outstanding).toBeCloseTo(before.rollup.outstanding, 1);
    expect((await admin.post(`/api/installments/${before.schedule[0].id}/default`)).status).toBe(400);
  });

  it('marking a loan defaulted removes it from the collection sheet', async () => {
    const res = await admin.post(`/api/loans/${loanId}/default`);
    expect(res.body.status).toBe('DEFAULTED');
    const sheet = await admin.get('/api/collections/today');
    expect(sheet.body.items.some((i: Item) => i.loanId === loanId)).toBe(false);
  });
});
