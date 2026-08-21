import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { AUTH_COOKIE_NAME, verifyToken, type AuthTokenPayload } from '../lib/auth.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

/** Reject requests without a valid session cookie. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.clearCookie(AUTH_COOKIE_NAME);
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

/** Reject requests whose authenticated user does not hold one of `roles`. Use after `requireAuth`. */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }
    next();
  };
}
