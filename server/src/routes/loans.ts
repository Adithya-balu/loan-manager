import { Router } from 'express';
import { z } from 'zod';
import { generateSchedule } from '@loan/shared';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/http.js';
import {
  createLoanWithSchedule,
  effectiveGraceDays,
  enrichInstallment,
  getSettingsMap,
  markLoanDefaulted,
  rollupLoan,
} from '../lib/loanService.js';
import { today } from '../lib/dates.js';

const router = Router();

const loanSchema = z.object({
  customerId: z.string().min(1),
  principal: z.number().positive(),
  annualRatePct: z.number().min(0),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
  interestMethod: z.enum(['FLAT', 'REDUCING']),
  installments: z.number().int().positive(),
  disbursementDate: z.string().min(1),
  repaymentStartDate: z.string().min(1),
  graceDaysOverride: z.number().int().min(0).nullable().optional(),
  defaultThresholdDaysOverride: z.number().int().min(0).nullable().optional(),
});

const previewSchema = z.object({
  principal: z.number().positive(),
  annualRatePct: z.number().min(0),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
  interestMethod: z.enum(['FLAT', 'REDUCING']),
  installments: z.number().int().positive(),
  repaymentStartDate: z.string().min(1),
});

// Schedule preview (no persistence) for the create/update form.
router.post(
  '/preview',
  asyncHandler(async (req, res) => {
    const p = previewSchema.parse(req.body);
    const summary = generateSchedule({
      principal: p.principal,
      annualRatePct: p.annualRatePct,
      frequency: p.frequency,
      installments: p.installments,
      startDate: p.repaymentStartDate,
      method: p.interestMethod,
    });
    res.json(summary);
  }),
);

// List loans with customer + rollup.
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const settings = await getSettingsMap();
    const loans = await prisma.loan.findMany({
      orderBy: { createdAt: 'desc' },
      include: { customer: true, schedule: true, payments: true },
    });
    const result = loans.map((loan) => ({
      ...loan,
      rollup: rollupLoan(loan, settings),
    }));
    res.json(result);
  }),
);

// Loan detail with enriched schedule + payments + rollup.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const settings = await getSettingsMap();
    const loan = await prisma.loan.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        customer: true,
        schedule: { orderBy: { sequence: 'asc' } },
        payments: { orderBy: { date: 'desc' }, include: { installment: true } },
      },
    });
    const grace = effectiveGraceDays(loan, settings);
    const ref = today();
    const schedule = loan.schedule.map((i) => enrichInstallment(i, grace, ref));
    const rollup = rollupLoan(loan, settings, ref);
    res.json({ ...loan, schedule, rollup, effectiveGraceDays: grace });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = loanSchema.parse(req.body);
    const loan = await createLoanWithSchedule(data);
    res.status(201).json(loan);
  }),
);

// Update loan. If no payments have been recorded, the schedule is regenerated.
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = loanSchema.parse(req.body);
    const existing = await prisma.loan.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { payments: true },
    });
    if (existing.payments.length > 0) {
      throw new Error('Cannot edit loan terms after payments have been recorded');
    }
    const summary = generateSchedule({
      principal: data.principal,
      annualRatePct: data.annualRatePct,
      frequency: data.frequency,
      installments: data.installments,
      startDate: data.repaymentStartDate,
      method: data.interestMethod,
    });
    const loan = await prisma.$transaction(async (tx) => {
      await tx.installment.deleteMany({ where: { loanId: existing.id } });
      return tx.loan.update({
        where: { id: existing.id },
        data: {
          customerId: data.customerId,
          principal: data.principal,
          annualRatePct: data.annualRatePct,
          frequency: data.frequency,
          interestMethod: data.interestMethod,
          installments: data.installments,
          disbursementDate: new Date(data.disbursementDate),
          repaymentStartDate: new Date(data.repaymentStartDate),
          graceDaysOverride: data.graceDaysOverride ?? null,
          defaultThresholdDaysOverride: data.defaultThresholdDaysOverride ?? null,
          schedule: {
            create: summary.rows.map((r) => ({
              sequence: r.sequence,
              dueDate: new Date(r.dueDate),
              amountDue: r.amountDue,
              principalComponent: r.principalComponent,
              interestComponent: r.interestComponent,
            })),
          },
        },
        include: { schedule: { orderBy: { sequence: 'asc' } }, customer: true },
      });
    });
    res.json(loan);
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.loan.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);

router.post(
  '/:id/default',
  asyncHandler(async (req, res) => {
    const loan = await markLoanDefaulted(req.params.id);
    res.json(loan);
  }),
);

export default router;
