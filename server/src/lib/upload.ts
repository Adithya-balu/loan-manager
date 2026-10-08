import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Shared uploads directory for local-dev file routes (profile photos, loan
 * documents). Vercel Functions are read-only except /tmp, so mkdir is best
 * effort — customer KYC documents go to Vercel Blob instead.
 */
export const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
try {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch {
  // Read-only filesystem (e.g. Vercel) — safe to ignore.
}

const storage = multer.diskStorage({
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

/** Configured multer instance (15 MB limit) shared across routes. */
export const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });
