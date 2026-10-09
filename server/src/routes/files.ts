import { Router } from 'express';
import { Readable } from 'node:stream';
import { get } from '@vercel/blob';
import { asyncHandler } from '../lib/http.js';

const router = Router();

// Stream a private Vercel Blob file (photo, loan document, logo) to a
// logged-in user. Stored URLs look like /api/files/<blob pathname>; see
// lib/storage.ts. Private Blob URLs aren't publicly fetchable, so access
// stays behind requireAuth.
router.get(
  '/*',
  asyncHandler(async (req, res) => {
    const pathname = decodeURIComponent((req.params as Record<string, string>)[0] ?? '');
    if (!pathname || pathname.includes('..')) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const result = await get(pathname, { access: 'private' });
    if (!result || result.statusCode !== 200 || !result.stream) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.setHeader('Content-Type', result.blob.contentType || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    Readable.fromWeb(result.stream as never).pipe(res);
  }),
);

export default router;
