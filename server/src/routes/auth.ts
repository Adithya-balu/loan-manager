import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/http.js';
import {
  AUTH_COOKIE_MAX_AGE_MS,
  AUTH_COOKIE_NAME,
  hashPassword,
  signToken,
  verifyPassword,
} from '../lib/auth.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

const isProduction = process.env.NODE_ENV === 'production';

function setAuthCookie(res: import('express').Response, token: string) {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  });
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = signToken({ sub: user.id, email: user.email, name: user.name, role: user.role });
    setAuthCookie(res, token);
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  }),
);

router.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME);
  res.status(204).end();
});

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  }),
);

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'AGENT']).default('AGENT'),
});

// Admin-only: provision additional users.
router.post(
  '/users',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const data = createUserSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) return res.status(409).json({ error: 'A user with that email already exists' });
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        role: data.role,
        passwordHash: await hashPassword(data.password),
      },
    });
    res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
  }),
);

router.get(
  '/users',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(users);
  }),
);

export default router;
