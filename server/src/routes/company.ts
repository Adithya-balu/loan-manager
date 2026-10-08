import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/http.js';
import { requireRole } from '../middleware/auth.js';
import { UPLOADS_DIR, upload } from '../lib/upload.js';

const router = Router();

const COMPANY_ID = 'default';

async function getOrCreateProfile() {
  const existing = await prisma.companyProfile.findUnique({ where: { id: COMPANY_ID } });
  if (existing) return existing;
  return prisma.companyProfile.create({ data: { id: COMPANY_ID, name: 'Loan Manager' } });
}

// Any authenticated user can read the company profile (used for sidebar branding).
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const profile = await getOrCreateProfile();
    res.json(profile);
  }),
);

const companySchema = z.object({
  name: z.string().min(1),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable().optional(),
});

router.put(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const data = companySchema.parse(req.body);
    const profile = await prisma.companyProfile.upsert({
      where: { id: COMPANY_ID },
      create: {
        id: COMPANY_ID,
        name: data.name,
        address: data.address || null,
        phone: data.phone || null,
        email: data.email || null,
      },
      update: {
        name: data.name,
        address: data.address ?? null,
        phone: data.phone ?? null,
        email: data.email === '' ? null : data.email,
      },
    });
    res.json(profile);
  }),
);

router.post(
  '/logo',
  requireRole('ADMIN'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new Error('No file uploaded');
    const existing = await getOrCreateProfile();
    if (existing.logoUrl) {
      const prev = path.join(UPLOADS_DIR, path.basename(existing.logoUrl));
      fs.promises.unlink(prev).catch(() => undefined);
    }
    const profile = await prisma.companyProfile.update({
      where: { id: COMPANY_ID },
      data: { logoUrl: `/uploads/${req.file.filename}` },
    });
    res.status(201).json(profile);
  }),
);

export default router;
