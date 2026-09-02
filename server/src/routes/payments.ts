import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/http.js';
import { deletePayment, recordPayment, updatePayment } from '../lib/loanService.js';

const router = Router();

const paymentSchema = z.object({
  loanId: z.string().min(1),
  installmentId: z.string().nullable().optional(),
  amount: z.number().positive(),
  date: z.string().min(1),
  mode: z.enum(['CASH', 'UPI', 'BANK', 'CHEQUE', 'OTHER']).optional(),
  note: z.string().nullable().optional(),
});

const paymentUpdateSchema = z.object({
  amount: z.number().positive(),
  date: z.string().min(1),
  mode: z.enum(['CASH', 'UPI', 'BANK', 'CHEQUE', 'OTHER']).optional(),
  note: z.string().nullable().optional(),
});

// List payments with optional filters.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { loanId, customerId } = req.query as { loanId?: string; customerId?: string };
    const payments = await prisma.payment.findMany({
      where: {
        ...(loanId ? { loanId } : {}),
        ...(customerId ? { customerId } : {}),
      },
      orderBy: { date: 'desc' },
      include: {
        customer: { select: { id: true, name: true, customerNumber: true } },
        loan: { select: { id: true, frequency: true, interestMethod: true } },
        installment: { select: { sequence: true } },
      },
    });
    res.json(payments);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = paymentSchema.parse(req.body);
    const payment = await recordPayment(data);
    res.status(201).json(payment);
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = paymentUpdateSchema.parse(req.body);
    const payment = await updatePayment(req.params.id, data);
    res.json(payment);
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await deletePayment(req.params.id);
    res.status(204).end();
  }),
);

export default router;
