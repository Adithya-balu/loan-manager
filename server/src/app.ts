import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
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
import { errorHandler } from './lib/errors.js';

const app = express();
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

app.use(errorHandler);

export default app;
