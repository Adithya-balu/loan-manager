import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Prisma } from '@prisma/client';
import { DUPLICATE_CUSTOMER_NUMBER, DUPLICATE_USER_EMAIL } from '@loan/shared';
import customersRouter from './routes/customers.js';
import loansRouter from './routes/loans.js';
import paymentsRouter from './routes/payments.js';
import actionsRouter from './routes/actions.js';
import dashboardRouter from './routes/dashboard.js';
import configRouter from './routes/config.js';
import companyRouter from './routes/company.js';
import authRouter from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';
import { UPLOADS_DIR } from './lib/upload.js';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', requireAuth, express.static(UPLOADS_DIR));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);

app.use('/api/customers', requireAuth, customersRouter);
app.use('/api/loans', requireAuth, loansRouter);
app.use('/api/payments', requireAuth, paymentsRouter);
app.use('/api', requireAuth, actionsRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/config', requireAuth, configRouter);
app.use('/api/company', requireAuth, companyRouter);

// Central error handler.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = String(err.meta?.target ?? '');
    if (target.includes('customerNumber')) return res.status(409).json({ error: DUPLICATE_CUSTOMER_NUMBER });
    if (target.includes('email')) return res.status(409).json({ error: DUPLICATE_USER_EMAIL });
    return res.status(409).json({ error: 'A record with that value already exists' });
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  console.error(err);
  res.status(400).json({ error: message });
});

// Vercel Functions invoke the exported app directly rather than listening on
// a port, so only start a listener when running as a normal Node process.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Loan Manager API running on http://localhost:${PORT}`);
  });
}

// Default export so this app can be used directly as a Vercel Function
// handler (see /api/index.ts at the repo root).
export default app;
