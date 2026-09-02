import { Router } from 'express';
import multer from 'multer';
import { Readable } from 'node:stream';
import { del, get, put } from '@vercel/blob';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/http.js';
import { computeCustomerRisk } from '../lib/riskService.js';
import { getSettingsMap, rollupLoan } from '../lib/loanService.js';

const router = Router();

// Files are buffered in memory, then uploaded to Vercel Blob (private access)
// — Vercel Functions have a read-only filesystem, so local disk storage
// doesn't work in production.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

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
    const blob = await put(`customers/${req.params.id}/${req.file.originalname}`, req.file.buffer, {
      access: 'private',
      addRandomSuffix: true,
      contentType: req.file.mimetype,
    });
    const doc = await prisma.customerDocument.create({
      data: {
        customerId: req.params.id,
        label,
        fileName: req.file.originalname,
        url: blob.url,
        mimeType: req.file.mimetype,
      },
    });
    res.status(201).json(doc);
  }),
);

// Stream a document's file content through the server so access stays
// gated behind requireAuth — private Vercel Blob URLs aren't publicly
// fetchable.
router.get(
  '/:id/documents/:docId/file',
  asyncHandler(async (req, res) => {
    const doc = await prisma.customerDocument.findUnique({ where: { id: req.params.docId } });
    if (!doc || doc.customerId !== req.params.id) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    const result = await get(doc.url, { access: 'private' });
    if (!result || result.statusCode !== 200 || !result.stream) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    res.setHeader('Content-Type', result.blob.contentType || doc.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
    Readable.fromWeb(result.stream as never).pipe(res);
  }),
);

router.delete(
  '/:id/documents/:docId',
  asyncHandler(async (req, res) => {
    const doc = await prisma.customerDocument.findUnique({ where: { id: req.params.docId } });
    if (doc) {
      await del(doc.url).catch(() => undefined);
      await prisma.customerDocument.delete({ where: { id: doc.id } });
    }
    res.status(204).end();
  }),
);

export default router;
