import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/http.js';
import { computeCustomerRisk } from '../lib/riskService.js';
import { getSettingsMap, rollupLoan } from '../lib/loanService.js';
import { UPLOADS_DIR } from '../index.js';

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '_').slice(0, 40);
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

const customerSchema = z.object({
  name: z.string().min(1),
  mobile: z.string().min(1),
  customerNumber: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')).nullable().optional(),
  address: z.string().optional().nullable(),
});

async function nextCustomerNumber(): Promise<string> {
  const count = await prisma.customer.count();
  return `C${String(count + 1).padStart(4, '0')}`;
}

// List customers with risk + portfolio summary.
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [customers, settings] = await Promise.all([
      prisma.customer.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          documents: true,
          loans: { include: { schedule: true, payments: true } },
        },
      }),
      getSettingsMap(),
    ]);

    const result = await Promise.all(
      customers.map(async (c) => {
        const risk = await computeCustomerRisk(c.id);
        const outstanding = c.loans.reduce(
          (a, loan) => a + rollupLoan(loan, settings).outstanding,
          0,
        );
        const activeLoans = c.loans.filter((l) => l.status === 'ACTIVE').length;
        return {
          id: c.id,
          customerNumber: c.customerNumber,
          name: c.name,
          mobile: c.mobile,
          email: c.email,
          address: c.address,
          documentCount: c.documents.length,
          loanCount: c.loans.length,
          activeLoans,
          outstanding: Math.round(outstanding * 100) / 100,
          risk,
          createdAt: c.createdAt,
        };
      }),
    );
    res.json(result);
  }),
);

// Customer detail with mini-dashboard, loans, payments, risk.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const settings = await getSettingsMap();
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        documents: true,
        loans: { include: { schedule: true, payments: true }, orderBy: { createdAt: 'desc' } },
        payments: { orderBy: { date: 'desc' }, include: { loan: true } },
      },
    });
    const risk = await computeCustomerRisk(customer.id);
    const loans = customer.loans.map((loan) => ({
      ...loan,
      rollup: rollupLoan(loan, settings),
    }));
    const totals = loans.reduce(
      (acc, l) => {
        acc.disbursed += l.principal;
        acc.outstanding += l.rollup.outstanding;
        acc.collected += l.rollup.totalPaid;
        acc.overdue += l.rollup.overdueAmount;
        return acc;
      },
      { disbursed: 0, outstanding: 0, collected: 0, overdue: 0 },
    );
    res.json({ customer, risk, loans, payments: customer.payments, totals });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = customerSchema.parse(req.body);
    const customerNumber = data.customerNumber?.trim() || (await nextCustomerNumber());
    const customer = await prisma.customer.create({
      data: {
        customerNumber,
        name: data.name,
        mobile: data.mobile,
        email: data.email || null,
        address: data.address || null,
      },
      include: { documents: true },
    });
    res.status(201).json(customer);
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = customerSchema.partial().parse(req.body);
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        name: data.name,
        mobile: data.mobile,
        customerNumber: data.customerNumber,
        email: data.email === '' ? null : data.email,
        address: data.address,
      },
      include: { documents: true },
    });
    res.json(customer);
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.customer.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);

// Upload a document for a customer.
router.post(
  '/:id/documents',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new Error('No file uploaded');
    const label = (req.body.label as string) || req.file.originalname;
    const doc = await prisma.customerDocument.create({
      data: {
        customerId: req.params.id,
        label,
        fileName: req.file.originalname,
        url: `/uploads/${req.file.filename}`,
        mimeType: req.file.mimetype,
      },
    });
    res.status(201).json(doc);
  }),
);

router.delete(
  '/:id/documents/:docId',
  asyncHandler(async (req, res) => {
    const doc = await prisma.customerDocument.findUnique({ where: { id: req.params.docId } });
    if (doc) {
      const filePath = path.join(UPLOADS_DIR, path.basename(doc.url));
      fs.promises.unlink(filePath).catch(() => undefined);
      await prisma.customerDocument.delete({ where: { id: doc.id } });
    }
    res.status(204).end();
  }),
);

export default router;
