import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/http.js';
import { DEFAULT_SETTINGS } from '../lib/loanService.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.loanTypeSetting.findMany();
    const map = { ...DEFAULT_SETTINGS };
    for (const r of rows) {
      map[r.frequency] = { graceDays: r.graceDays, defaultThresholdDays: r.defaultThresholdDays };
    }
    res.json({
      currency: 'INR',
      locale: 'en-IN',
      loanTypes: (['DAILY', 'WEEKLY', 'MONTHLY'] as const).map((f) => ({
        frequency: f,
        graceDays: map[f].graceDays,
        defaultThresholdDays: map[f].defaultThresholdDays,
      })),
    });
  }),
);

const settingSchema = z.object({
  loanTypes: z.array(
    z.object({
      frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
      graceDays: z.number().int().min(0),
      defaultThresholdDays: z.number().int().min(0),
    }),
  ),
});

router.put(
  '/',
  asyncHandler(async (req, res) => {
    const data = settingSchema.parse(req.body);
    await prisma.$transaction(
      data.loanTypes.map((t) =>
        prisma.loanTypeSetting.upsert({
          where: { frequency: t.frequency },
          create: t,
          update: { graceDays: t.graceDays, defaultThresholdDays: t.defaultThresholdDays },
        }),
      ),
    );
    res.json({ ok: true });
  }),
);

export default router;
