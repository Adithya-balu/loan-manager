import { Router } from 'express';
import { Readable } from 'node:stream';
import { del, get } from '@vercel/blob';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/http.js';
import { computeCustomerRisk } from '../lib/riskService.js';
import { getSettingsMap, rollupLoan } from '../lib/loanService.js';

const router = Router();

// Document uploads go straight from the browser to Vercel Blob (private
// access) using a client-token handshake — Vercel Functions cap request
// bodies at 4.5MB, so routing large files through this Express app (e.g. via
// multer) fails for anything near/above that size. See POST
// '/:id/documents/upload-token' + '/:id/documents/confirm' below.
const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
const MAX_DOCUMENTS_PER_CUSTOMER = 20;

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
// Issues a short-lived client token so the browser can upload the file
// directly to Vercel Blob, bypassing this function's request body entirely.
router.post(
  '/:id/documents/upload-token',
  asyncHandler(async (req, res) => {
    const customerId = req.params.id;
    const body = req.body as HandleUploadBody;
    try {
      const jsonResponse = await handleUpload({
        body,
        request: req,
        onBeforeGenerateToken: async (pathname) => {
          if (!pathname.startsWith(`customers/${customerId}/`)) {
            throw new Error('Invalid upload path for this customer');
          }
          const existingCount = await prisma.customerDocument.count({ where: { customerId } });
          if (existingCount >= MAX_DOCUMENTS_PER_CUSTOMER) {
            throw new Error(
              `This customer already has the maximum of ${MAX_DOCUMENTS_PER_CUSTOMER} documents. Remove one before uploading another.`,
            );
          }
          return {
            addRandomSuffix: true,
            maximumSizeInBytes: MAX_DOCUMENT_BYTES,
          };
        },
      });
      res.json(jsonResponse);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Upload authorization failed' });
    }
  }),
);

const confirmDocumentSchema = z.object({
  url: z.string().url(),
  fileName: z.string().min(1),
  label: z.string().min(1),
  mimeType: z.string().min(1),
});

// Called by the client after the file has already landed in Blob storage, to
// record the document metadata against this customer.
router.post(
  '/:id/documents/confirm',
  asyncHandler(async (req, res) => {
    const data = confirmDocumentSchema.parse(req.body);
    if (!data.url.includes(`customers/${req.params.id}/`)) {
      throw new Error('Document does not belong to this customer');
    }
    const existingCount = await prisma.customerDocument.count({ where: { customerId: req.params.id } });
    if (existingCount >= MAX_DOCUMENTS_PER_CUSTOMER) {
      throw new Error(
        `This customer already has the maximum of ${MAX_DOCUMENTS_PER_CUSTOMER} documents. Remove one before uploading another.`,
      );
    }
    const doc = await prisma.customerDocument.create({
      data: {
        customerId: req.params.id,
        label: data.label,
        fileName: data.fileName,
        url: data.url,
        mimeType: data.mimeType,
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
