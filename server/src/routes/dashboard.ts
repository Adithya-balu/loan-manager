import { Router } from 'express';
import { round2, toISODate, type LoanFrequency } from '@loan/shared';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/http.js';
import { dateOnly, today } from '../lib/dates.js';
import {
  effectiveGraceDays,
  enrichInstallment,
  getSettingsMap,
  rollupLoan,
} from '../lib/loanService.js';
import { computeCustomerRisk } from '../lib/riskService.js';

const router = Router();

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const settings = await getSettingsMap();
    const ref = today();
    const [loans, payments, customers] = await Promise.all([
      prisma.loan.findMany({
        include: { schedule: true, payments: true, customer: true },
      }),
      prisma.payment.findMany(),
      prisma.customer.findMany({ select: { id: true, name: true, customerNumber: true } }),
    ]);

    let totalDisbursed = 0;
    let outstanding = 0;
    let overdueAmount = 0;
    let interestEarned = 0;
    let maturedDue = 0;
    let maturedCollected = 0;
    let actionRequiredCount = 0;
    const statusCounts = { ACTIVE: 0, CLOSED: 0, DEFAULTED: 0 } as Record<string, number>;
    const portfolio: Record<LoanFrequency, { count: number; outstanding: number }> = {
      DAILY: { count: 0, outstanding: 0 },
      WEEKLY: { count: 0, outstanding: 0 },
      MONTHLY: { count: 0, outstanding: 0 },
    };

    for (const loan of loans) {
      totalDisbursed += loan.principal;
      statusCounts[loan.status] = (statusCounts[loan.status] ?? 0) + 1;
      const rollup = rollupLoan(loan, settings, ref);
      outstanding += rollup.outstanding;
      overdueAmount += rollup.overdueAmount;
      actionRequiredCount += rollup.actionRequiredCount + (rollup.loanDefaultEligible ? 1 : 0);
      portfolio[loan.frequency].count += 1;
      portfolio[loan.frequency].outstanding += rollup.outstanding;

      const grace = effectiveGraceDays(loan, settings);
      for (const inst of loan.schedule) {
        if (inst.status === 'PAID') interestEarned += inst.interestComponent;
        const e = enrichInstallment(inst, grace, ref);
        const due = dateOnly(inst.dueDate);
        if (due.getTime() <= ref.getTime() && inst.status !== 'DEFAULTED') {
          maturedDue += inst.amountDue;
          maturedCollected += Math.min(inst.paidAmount, inst.amountDue);
        }
      }
    }

    const todayISO = toISODate(ref);
    const weekAgo = new Date(ref.getTime() - 6 * 86400000);
    const monthStart = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
    let collectedToday = 0;
    let collectedWeek = 0;
    let collectedMonth = 0;
    for (const p of payments) {
      const d = dateOnly(p.date);
      if (toISODate(d) === todayISO) collectedToday += p.amount;
      if (d.getTime() >= weekAgo.getTime()) collectedWeek += p.amount;
      if (d.getTime() >= monthStart.getTime()) collectedMonth += p.amount;
    }

    // 6-month disbursement vs collection trend.
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - i, 1));
      months.push(monthKey(d));
    }
    const disbursedByMonth: Record<string, number> = {};
    const collectedByMonth: Record<string, number> = {};
    for (const m of months) {
      disbursedByMonth[m] = 0;
      collectedByMonth[m] = 0;
    }
    for (const loan of loans) {
      const k = monthKey(dateOnly(loan.disbursementDate));
      if (k in disbursedByMonth) disbursedByMonth[k] += loan.principal;
    }
    for (const p of payments) {
      const k = monthKey(dateOnly(p.date));
      if (k in collectedByMonth) collectedByMonth[k] += p.amount;
    }
    const trend = months.map((m) => ({
      month: m,
      disbursed: round2(disbursedByMonth[m]),
      collected: round2(collectedByMonth[m]),
    }));

    // Top-risk customers (lowest score = riskiest).
    const risks = await Promise.all(
      customers.map(async (c) => ({ ...c, risk: await computeCustomerRisk(c.id) })),
    );
    const topRisk = risks
      .filter((r) => r.risk.score !== null)
      .sort((a, b) => (a.risk.score ?? 100) - (b.risk.score ?? 100))
      .slice(0, 5);

    res.json({
      kpis: {
        totalDisbursed: round2(totalDisbursed),
        outstanding: round2(outstanding),
        interestEarned: round2(interestEarned),
        overdueAmount: round2(overdueAmount),
        activeLoans: statusCounts.ACTIVE ?? 0,
        closedLoans: statusCounts.CLOSED ?? 0,
        defaultedLoans: statusCounts.DEFAULTED ?? 0,
        totalCustomers: customers.length,
        collectionEfficiency: maturedDue > 0 ? round2((maturedCollected / maturedDue) * 100) : 100,
      },
      collections: {
        today: round2(collectedToday),
        week: round2(collectedWeek),
        month: round2(collectedMonth),
      },
      portfolio,
      trend,
      actionRequiredCount,
      topRisk,
    });
  }),
);

export default router;
