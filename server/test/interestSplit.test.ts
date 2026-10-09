// Interest is collected before principal within each installment, and every
// payment records how it split. Interest income comes from those splits.
import { beforeEach, describe, expect, it } from 'vitest';
import { round2 } from '@loan/shared';
import { type Client, createCustomer, createLoan, iso, login, pay, prisma, resetDb } from './helpers.js';
import { rebuildLoanAllocation } from '../src/lib/loanService.js';

let admin: Client;
let customerId: string;

beforeEach(async () => {
  await resetDb();
  admin = await login();
  customerId = (await createCustomer(admin)).id;
});

interface Inst { id: string; sequence: number; amountDue: number; interestComponent: number; principalComponent: number; paidAmount: number; interestPaid: number; principalPaid: number; waivedAmount: number }
interface Pay { id: string; amount: number; interestAmount: number; principalAmount: number; kind: string }
const detail = async (id: string) => (await admin.get(`/api/loans/${id}`)).body as {
  schedule: Inst[]; payments: Pay[]; rollup: Record<string, number>;
};
const split = (i: Inst) => [i.interestPaid, i.principalPaid];

/** 4 weekly installments of 1 020 (1 000 principal + 20 interest), all past due. */
const weekly = async () =>
  (
    await createLoan(admin, customerId, {
      principal: 4000, annualRatePct: 26, frequency: 'WEEKLY', interestMethod: 'FLAT',
      installments: 4, disbursementDate: iso(-35), repaymentStartDate: iso(-28),
    })
  ).id;

describe('interest before principal within an installment', () => {
  it('a payment smaller than the interest is all interest', async () => {
    const id = await weekly();
    const p = (await pay(admin, id, 15, iso(-28))).body;
    expect(p).toMatchObject({ interestAmount: 15, principalAmount: 0 });
    expect(split((await detail(id)).schedule[0])).toEqual([15, 0]);
  });

  it('fills the rest of the interest, then principal, then moves on to the next installment', async () => {
    const id = await weekly();
    await pay(admin, id, 15, iso(-28));
    const second = (await pay(admin, id, 1030, iso(-20))).body; // 5 interest + 1 000 principal (#1), 20 interest + 5 principal (#2)
    expect(second).toMatchObject({ interestAmount: 25, principalAmount: 1005 });
    const d = await detail(id);
    expect(split(d.schedule[0])).toEqual([20, 1000]);
    expect(split(d.schedule[1])).toEqual([20, 5]);
    expect(split(d.schedule[2])).toEqual([0, 0]);
  });

  it('an overpayment beyond the schedule counts as principal', async () => {
    const id = await weekly();
    const p = (await pay(admin, id, 4100, iso(-1))).body;
    expect(p).toMatchObject({ interestAmount: 80, principalAmount: 4020 });
    const last = (await detail(id)).schedule[3];
    expect(split(last)).toEqual([20, 1020]);
  });
});

describe('interest income (dashboard)', () => {
  it('counts interest on partly paid installments (previously only fully paid ones)', async () => {
    const id = await weekly();
    await pay(admin, id, 500, iso(-28));
    const k = (await admin.get('/api/dashboard')).body.kpis;
    expect(k.interestEarned).toBe(20);
    expect((await detail(id)).rollup).toMatchObject({ interestCollected: 20, principalCollected: 480 });
  });

  it('books revenue in the month the interest was received', async () => {
    const id = await weekly();
    await pay(admin, id, 20, iso(0)); // interest of #1, today
    const trend = (await admin.get('/api/dashboard')).body.trend;
    expect(trend.at(-1).revenue).toBe(20);
    expect(round2(trend.reduce((a: number, m: { revenue: number }) => a + m.revenue, 0))).toBe(20);
  });
});

describe('loan totals', () => {
  it('report interest/principal collected and principal outstanding', async () => {
    const id = await weekly();
    await pay(admin, id, 1530, iso(-10));
    expect((await detail(id)).rollup).toMatchObject({
      totalPaid: 1530, interestCollected: 40, principalCollected: 1490, outstandingPrincipal: 2510,
    });
  });
});

describe('history changes recompute the split', () => {
  it('edit and delete re-split every remaining payment', async () => {
    const id = await weekly();
    const a = (await pay(admin, id, 500, iso(-27))).body;
    const b = (await pay(admin, id, 600, iso(-20))).body;
    await admin.put(`/api/payments/${a.id}`).send({ amount: 10, date: iso(-27) });
    let d = await detail(id);
    // a (10) is all #1 interest; b (600) finishes #1's interest (10) and pays 590 of its principal.
    expect(d.payments.find((p) => p.id === a.id)).toMatchObject({ interestAmount: 10, principalAmount: 0 });
    expect(d.payments.find((p) => p.id === b.id)).toMatchObject({ interestAmount: 10, principalAmount: 590 });

    await admin.delete(`/api/payments/${a.id}`);
    d = await detail(id);
    expect(d.payments.find((p) => p.id === b.id)).toMatchObject({ interestAmount: 20, principalAmount: 580 });
    expect(split(d.schedule[0])).toEqual([20, 580]);
  });
});

describe('capitalization keeps the split', () => {
  it('a capitalized installment keeps the interest it received, also after a replay', async () => {
    const id = (
      await createLoan(admin, customerId, {
        principal: 4000, annualRatePct: 26, frequency: 'WEEKLY', interestMethod: 'FLAT',
        installments: 4, disbursementDate: iso(-35), repaymentStartDate: iso(-28),
      })
    ).id;
    await pay(admin, id, 300, iso(-27));
    const d0 = await detail(id);
    await admin.post(`/api/installments/${d0.schedule[0].id}/default`);
    const later = (await pay(admin, id, 100, iso(-1))).body;
    await admin.delete(`/api/payments/${later.id}`);
    expect(split((await detail(id)).schedule[0])).toEqual([20, 280]);
  });
});

describe('settlement split', () => {
  it('interest on the settlement = overdue interest + interest-to-date; waived interest is not income', async () => {
    // 12 000 at 36.5% flat over 12 months (1 000 + 365 a month); #1 overdue by 15 days.
    const id = (
      await createLoan(admin, customerId, {
        principal: 12000, annualRatePct: 36.5, frequency: 'MONTHLY', interestMethod: 'FLAT',
        installments: 12, disbursementDate: iso(-45), repaymentStartDate: iso(-15),
      })
    ).id;
    await pay(admin, id, 100, iso(-15)); // 100 of #1's interest
    const res = (await admin.post(`/api/loans/${id}/settlement`).send({ date: iso(0) })).body;
    // #1's remaining 265 interest + 1 000 principal, 11 000 future principal, 165 interest-to-date.
    expect(res.payment).toMatchObject({ amount: 12430, interestAmount: 430, principalAmount: 12000 });
    const d = await detail(id);
    expect(split(d.schedule[0])).toEqual([365, 1000]);
    expect(d.schedule.slice(1).every((i) => i.interestPaid === 0 && i.principalPaid === 1000 && i.waivedAmount === 365)).toBe(true);
    expect((await admin.get('/api/dashboard')).body.kpis.interestEarned).toBe(530); // 100 + 430
  });

  it('settles a loan whose future installment was part-prepaid beyond its interest', async () => {
    const id = (
      await createLoan(admin, customerId, {
        principal: 12000, annualRatePct: 36.5, frequency: 'MONTHLY', interestMethod: 'FLAT',
        installments: 12, disbursementDate: iso(-45), repaymentStartDate: iso(-15),
      })
    ).id;
    await pay(admin, id, 1365 + 500, iso(-1)); // #1 in full, then 365 interest + 135 principal of #2
    const quote = (await admin.get(`/api/loans/${id}/settlement`)).body;
    expect(quote.remainingPrincipal).toBe(11000 - 135);
  });
});

describe('backfill (rebuildLoanAllocation)', () => {
  it('reconstructs splits for loans recorded before they existed, including settled ones', async () => {
    const id = await weekly();
    await pay(admin, id, 1030, iso(-20));
    await admin.post(`/api/loans/${id}/settlement`).send({ date: iso(0) });
    const expected = await detail(id);

    // Simulate pre-migration data: splits unknown (payments treated as principal).
    await prisma.installment.updateMany({ where: { loanId: id }, data: { interestPaid: 0, principalPaid: 0 } });
    await prisma.$executeRawUnsafe(`UPDATE "Payment" SET "interestAmount" = 0, "principalAmount" = "amount" WHERE "loanId" = '${id}'`);

    await rebuildLoanAllocation(id);
    const rebuilt = await detail(id);
    expect(rebuilt.schedule.map(split)).toEqual(expected.schedule.map(split));
    expect(rebuilt.payments.map((p) => [p.interestAmount, p.principalAmount])).toEqual(
      expected.payments.map((p) => [p.interestAmount, p.principalAmount]),
    );
    expect((await admin.get(`/api/loans/${id}`)).body.status).toBe('CLOSED');
  });
});
