import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Client, createCustomer, createLoan, login, resetDb, server } from './helpers.js';

// In-memory stand-in for Vercel Blob.
const blobs = new Map<string, { body: Buffer; contentType: string }>();
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (pathname: string, body: Buffer, opts: { contentType: string }) => {
    const stored = pathname.replace(/(\.[a-z0-9]+)?$/i, (ext) => `-rnd${ext}`);
    blobs.set(stored, { body, contentType: opts.contentType });
    return { pathname: stored, url: `https://blob.test/${stored}` };
  }),
  get: vi.fn(async (pathname: string) => {
    const b = blobs.get(pathname);
    if (!b) return null;
    return {
      statusCode: 200,
      stream: new Response(new Uint8Array(b.body)).body,
      blob: { contentType: b.contentType },
    };
  }),
  del: vi.fn(async (pathname: string) => {
    blobs.delete(pathname);
  }),
}));

let admin: Client;
beforeAll(() => vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-token'));
afterAll(() => vi.unstubAllEnvs());
beforeEach(async () => {
  blobs.clear();
  await resetDb();
  admin = await login();
});

describe('uploads with Vercel Blob (#15)', () => {
  it('stores the company logo privately and serves it behind login', async () => {
    const res = await admin
      .post('/api/company/logo')
      .attach('file', Buffer.from('<svg/>'), { filename: 'logo.svg', contentType: 'image/svg+xml' });
    expect(res.status).toBe(201);
    expect(res.body.logoUrl).toMatch(/^\/api\/files\/company\/logo-rnd\.svg$/);

    const file = await admin.get(res.body.logoUrl);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('image/svg+xml');
    expect((await request(server).get(res.body.logoUrl)).status).toBe(401);
  });

  it('replacing a customer photo deletes the old blob', async () => {
    const c = await createCustomer(admin);
    const up = (name: string) =>
      admin.post(`/api/customers/${c.id}/photo`).attach('file', Buffer.from([1, 2, 3]), { filename: name, contentType: 'image/png' });
    const first = (await up('a.png')).body.photoUrl;
    const second = (await up('b.png')).body.photoUrl;
    expect(first).not.toBe(second);
    expect((await admin.get(first)).status).toBe(404);
    expect((await admin.get(second)).status).toBe(200);
  });

  it('stores and removes loan documents', async () => {
    const c = await createCustomer(admin);
    const loan = await createLoan(admin, c.id);
    const doc = (
      await admin
        .post(`/api/loans/${loan.id}/documents`)
        .field('label', 'KYC')
        .attach('file', Buffer.from('pdf'), { filename: 'kyc.pdf', contentType: 'application/pdf' })
    ).body;
    expect(doc.url).toMatch(/^\/api\/files\/loans\//);
    expect(Buffer.from((await admin.get(doc.url)).body).toString()).toBe('pdf');
    await admin.delete(`/api/loans/${loan.id}/documents/${doc.id}`);
    expect(blobs.size).toBe(0);
  });

  it('rejects files over the 4 MB function limit with a clear message', async () => {
    const res = await admin
      .post('/api/company/logo')
      .attach('file', Buffer.alloc(4 * 1024 * 1024 + 1), { filename: 'big.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('File is too large (max 4 MB)');
  });

  it('404s for unknown or traversal paths', async () => {
    expect((await admin.get('/api/files/nope.png')).status).toBe(404);
    expect((await admin.get('/api/files/..%2Fsecret')).status).toBe(404);
  });

  it('uploads for a missing customer 404 without storing anything', async () => {
    const res = await admin
      .post('/api/customers/missing/photo')
      .attach('file', Buffer.from([1]), { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(404);
    expect(blobs.size).toBe(0);
  });
});
