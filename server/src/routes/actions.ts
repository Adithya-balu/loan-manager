import { Router } from 'express';
import { toISODate } from '@loan/shared';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/http.js';
import { dateOnly, today } from '../lib/dates.js';
import {
  capitalizeInstallment,
  effectiveGraceDays,
  enrichInstallment,
  getSettingsMap,
  rollupLoan,
} from '../lib/loanService.js';

const router = Router();

// Confirm a default / partial capitalization on an installment.
router.post(
  '/installments/:id/default',
  asyncHandler(async (req, res) => {
    const result = await capitalizeInstallment(req.params.id);
    res.json(result);
  }),
);

// Today's collection: every installment due today that isn't fully settled,
// plus (optionally) overdue carry-overs.
router.get(
  '/collections/today',
  asyncHandler(async (req, res) => {
    const includeOverdue = req.query.includeOverdue !== 'false';
    const settings = await getSettingsMap();
    const ref = today();
    const todayISO = toISODate(ref);

    const loans = await prisma.loan.findMany({
      where: { status: 'ACTIVE' },
      include: { customer: true, schedule: { orderBy: { sequence: 'asc' } } },
    });

    const items: unknown[] = [];
    let dueToday = 0;
    let overdue = 0;
    for (const loan of loans) {
      const grace = effectiveGraceDays(loan, settings);
      for (const inst of loan.schedule) {
        const e = enrichInstallment(inst, grace, ref);
        if (e.remaining <= 0.005 || e.derivedStatus === 'DEFAULTED') continue;
        const dueISO = toISODate(dateOnly(inst.dueDate));
        const isToday = dueISO === todayISO;
        const isOverdue = e.derivedStatus === 'OVERDUE';
        if (!isToday && !(includeOverdue && isOverdue)) continue;
        if (isToday) dueToday += e.remaining;
        if (isOverdue) overdue += e.remaining;
        items.push({
          installmentId: inst.id,
          loanId: loan.id,
          customerId: loan.customerId,
          customerName: loan.customer.name,
          customerNumber: loan.customer.customerNumber,
          sequence: inst.sequence,
          dueDate: dueISO,
          amountDue: inst.amountDue,
          paidAmount: inst.paidAmount,
          remaining: e.remaining,
          status: e.derivedStatus,
          daysPastDue: e.daysPastDue,
          frequency: loan.frequency,
          actionRequired: e.actionRequired,
        });
      }
    }

    items.sort((a, b) => (a as any).dueDate.localeCompare((b as any).dueDate));
    res.json({
      date: todayISO,
      totals: {
        dueToday: Math.round(dueToday * 100) / 100,
        overdue: Math.round(overdue * 100) / 100,
        count: items.length,
      },
      items,
    });
  }),
);

// Action required queue: installments past grace + loans eligible to be defaulted.
router.get(
  '/action-required',
  asyncHandler(async (_req, res) => {
    const settings = await getSettingsMap();
    const ref = today();
    const loans = await prisma.loan.findMany({
      where: { status: 'ACTIVE' },
      include: { customer: true, schedule: { orderBy: { sequence: 'asc' } }, payments: true },
    });

    const installmentActions: unknown[] = [];
    const loanActions: unknown[] = [];

    for (const loan of loans) {
      const grace = effectiveGraceDays(loan, settings);
      for (const inst of loan.schedule) {
        const e = enrichInstallment(inst, grace, ref);
        if (e.actionRequired) {
          installmentActions.push({
            installmentId: inst.id,
            loanId: loan.id,
            customerId: loan.customerId,
            customerName: loan.customer.name,
            customerNumber: loan.customer.customerNumber,
            sequence: inst.sequence,
            dueDate: toISODate(dateOnly(inst.dueDate)),
            amountDue: inst.amountDue,
            paidAmount: inst.paidAmount,
            remaining: e.remaining,
            daysPastDue: e.daysPastDue,
            graceDays: grace,
            kind: inst.paidAmount > 0 ? 'PARTIAL' : 'DEFAULT',
            frequency: loan.frequency,
          });
        }
      }

      const rollup = rollupLoan(loan, settings, ref);
      if (rollup.loanDefaultEligible) {
        loanActions.push({
          loanId: loan.id,
          customerId: loan.customerId,
          customerName: loan.customer.name,
          customerNumber: loan.customer.customerNumber,
          frequency: loan.frequency,
          outstanding: rollup.outstanding,
          lastPaymentDate: rollup.lastPaymentDate,
          nextDueDate: rollup.nextDueDate,
        });
      }
    }

    installmentActions.sort((a, b) => (b as any).daysPastDue - (a as any).daysPastDue);
    res.json({
      installmentActions,
      loanActions,
      total: installmentActions.length + loanActions.length,
    });
  }),
);

export default router;
