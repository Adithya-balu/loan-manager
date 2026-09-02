import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import customersRouter from './routes/customers.js';
import loansRouter from './routes/loans.js';
import paymentsRouter from './routes/payments.js';
import actionsRouter from './routes/actions.js';
import dashboardRouter from './routes/dashboard.js';
import configRouter from './routes/config.js';
import authRouter from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.resolve(__dirname, '../uploads');
// Vercel Functions run on a read-only filesystem (except /tmp), so this local
// uploads dir only exists for local dev. Document uploads themselves go to
// Vercel Blob (see routes/customers.ts); this directory is kept only for
// backwards-compatible local static serving.
try {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch {
  // Read-only filesystem (e.g. Vercel) — safe to ignore.
}

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

// Central error handler.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
