import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { ZodError, type ZodIssue } from 'zod';
import { DUPLICATE_CUSTOMER_NUMBER, DUPLICATE_USER_EMAIL } from '@loan/shared';

/** "customerNumber" → "Customer number". */
function fieldLabel(path: (string | number)[]): string {
  const key = [...path].reverse().find((p): p is string => typeof p === 'string');
  if (!key) return 'Value';
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function describeIssue(issue: ZodIssue): string {
  const label = fieldLabel(issue.path);
  const missing =
    (issue.code === 'invalid_type' && issue.received === 'undefined') ||
    (issue.code === 'too_small' && issue.type === 'string' && issue.minimum === 1);
  if (missing) return `${label} is required`;
  // Messages written in our schemas are already full sentences; zod's defaults
  // ("Expected integer, received float") need the field name in front.
  const isCustom = issue.code === 'custom' || (issue.code === 'invalid_string' && !/^Invalid/.test(issue.message));
  return isCustom ? issue.message : `${label}: ${issue.message}`;
}

/** Human-readable summary of a validation failure (first few issues). */
export function formatZodError(err: ZodError): string {
  return [...new Set(err.issues.slice(0, 3).map(describeIssue))].join('; ');
}

function send(res: Response, status: number, error: string) {
  res.status(status).json({ error });
}

/**
 * Central error handler. Business-rule violations are thrown as plain Errors
 * and returned as 400 with their message. Validation, not-found and database
 * errors are mapped to clear statuses; anything else is a 500 with a generic
 * message so internals (queries, file paths) never reach the client.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) return send(res, 400, formatZodError(err));

  // express.json() parse failures.
  if (typeof err === 'object' && err && (err as { type?: string }).type === 'entity.parse.failed') {
    return send(res, 400, 'Malformed JSON body');
  }

  if (err instanceof MulterError) {
    return send(res, 400, err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') return send(res, 404, 'Not found');
    if (err.code === 'P2002') {
      const target = String(err.meta?.target ?? '');
      if (target.includes('customerNumber')) return send(res, 409, DUPLICATE_CUSTOMER_NUMBER);
      if (target.includes('email')) return send(res, 409, DUPLICATE_USER_EMAIL);
      return send(res, 409, 'A record with that value already exists');
    }
    if (err.code === 'P2003') return send(res, 409, 'This record is still used by other records');
  }

  const isPrisma =
    err instanceof Prisma.PrismaClientKnownRequestError ||
    err instanceof Prisma.PrismaClientUnknownRequestError ||
    err instanceof Prisma.PrismaClientValidationError ||
    err instanceof Prisma.PrismaClientInitializationError ||
    err instanceof Prisma.PrismaClientRustPanicError;
  if (isPrisma || !(err instanceof Error)) {
    console.error(err);
    return send(res, 500, 'Something went wrong. Please try again.');
  }

  return send(res, 400, err.message);
}
