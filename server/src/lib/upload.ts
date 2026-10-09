import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { RequestHandler } from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** True when uploads should go to Vercel Blob instead of local disk (see storage.ts). */
export const blobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/**
 * Local-dev uploads directory (profile photos, loan documents, logos).
 * Vercel Functions are read-only except /tmp, so mkdir is best effort —
 * there, files go to Vercel Blob instead.
 */
export const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
try {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch {
  // Read-only filesystem (e.g. Vercel) — safe to ignore.
}

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path
      .basename(file.originalname, ext)
      .replace(/[^a-z0-9]/gi, '_')
      .slice(0, 40);
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const limits = { fileSize: 15 * 1024 * 1024 };
const toDisk = multer({ storage: diskStorage, limits });
// Blob uploads are streamed from memory; storage.ts enforces the smaller Vercel cap.
const toMemory = multer({ storage: multer.memoryStorage(), limits });

/** Multer middleware (15 MB limit), choosing disk or memory per request. */
export const upload = {
  single: (field: string): RequestHandler => {
    const disk = toDisk.single(field);
    const memory = toMemory.single(field);
    return (req, res, next) => (blobEnabled() ? memory : disk)(req, res, next);
  },
};
