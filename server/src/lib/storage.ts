import fs from 'node:fs';
import path from 'node:path';
import { del, put } from '@vercel/blob';
import { UPLOADS_DIR, blobEnabled } from './upload.js';

/**
 * Where uploaded photos, loan documents and logos live. On Vercel the
 * filesystem is read-only, so when BLOB_READ_WRITE_TOKEN is set files go to
 * Vercel Blob (private) and are served back through GET /api/files/*, behind
 * login. Without it (local dev) they're written to server/uploads and served
 * from /uploads. Either way the stored URL is something the browser can load
 * with its session cookie.
 */
export { blobEnabled };

/** Stored-URL prefix for files kept in Vercel Blob. */
export const BLOB_FILE_PREFIX = '/api/files/';

/**
 * Vercel Functions reject request bodies over 4.5 MB, so server-side uploads
 * are capped below that when running against Blob.
 */
export const BLOB_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

function safeName(original: string) {
  const ext = path.extname(original);
  const base = path.basename(original, ext).replace(/[^a-z0-9]/gi, '_').slice(0, 40);
  return `${base}${ext}`;
}

/** Persist a multer upload under `folder` and return the URL to store. */
export async function storeUpload(file: Express.Multer.File, folder: string): Promise<string> {
  if (!blobEnabled()) return `/uploads/${file.filename}`;
  if (file.size > BLOB_UPLOAD_LIMIT_BYTES) {
    throw new Error('File is too large (max 4 MB)');
  }
  const blob = await put(`${folder}/${safeName(file.originalname)}`, file.buffer, {
    access: 'private',
    addRandomSuffix: true,
    contentType: file.mimetype,
  });
  return BLOB_FILE_PREFIX + blob.pathname.split('/').map(encodeURIComponent).join('/');
}

/** Best-effort removal of a previously stored upload. */
export async function removeUpload(url: string | null | undefined): Promise<void> {
  if (!url) return;
  if (url.startsWith(BLOB_FILE_PREFIX)) {
    const pathname = decodeURIComponent(url.slice(BLOB_FILE_PREFIX.length));
    await del(pathname).catch(() => undefined);
    return;
  }
  if (url.startsWith('/uploads/')) {
    await fs.promises.unlink(path.join(UPLOADS_DIR, path.basename(url))).catch(() => undefined);
  }
}
