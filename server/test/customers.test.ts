import { beforeAll, describe, expect, it } from 'vitest';
import { DUPLICATE_CUSTOMER_NUMBER } from '@loan/shared';
import { type Client, login, resetDb } from './helpers.js';

let admin: Client;
beforeAll(async () => {
  await resetDb();
  admin = await login();
});

describe('customer validation', () => {
  it.each([
    [{ name: 'A', mobile: '12345' }, /10 digits/],
    [{ name: 'A', mobile: '9000000001', aadhaar: '123' }, /12 digits/],
    [{ name: '', mobile: '9000000001' }, /.+/],
    [{ name: 'A', mobile: '9000000001', email: 'nope' }, /.+/],
  ])('rejects %j', async (body, message) => {
    const res = await admin.post('/api/customers').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });
});

describe('customer lifecycle', () => {
  it('creates, updates, reads and lists', async () => {
    const created = await admin
      .post('/api/customers')
      .send({ name: 'Kumar', mobile: '9876500001', aadhaar: '123412341234', location: 'Chennai', email: '' });
    expect(created.status).toBe(201);
    expect(created.body.customerNumber).toMatch(/^C\d{4}$/);
    expect(created.body).toMatchObject({ aadhaar: '123412341234', location: 'Chennai', email: null });

    const id = created.body.id;
    const updated = await admin.put(`/api/customers/${id}`).send({ name: 'Kumar R', mobile: '9876500001', aadhaar: '' });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ name: 'Kumar R', aadhaar: null });
    expect((await admin.put(`/api/customers/${id}`).send({ mobile: '99' })).status).toBe(400);

    const detail = await admin.get(`/api/customers/${id}`);
    expect(detail.body.customer.id).toBe(id);
    expect(detail.body.risk).toBeDefined();

    const list = await admin.get('/api/customers');
    expect(list.body.find((c: { id: string }) => c.id === id)).toHaveProperty('risk');
  });

  it('rejects a duplicate customer number with a clear 409', async () => {
    await admin.post('/api/customers').send({ name: 'A', mobile: '9876500002', customerNumber: 'X-1' });
    const res = await admin.post('/api/customers').send({ name: 'B', mobile: '9876500003', customerNumber: 'X-1' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(DUPLICATE_CUSTOMER_NUMBER);
  });

  it('uploads a photo that is served to logged-in users', async () => {
    const c = await admin.post('/api/customers').send({ name: 'Photo', mobile: '9876500004' });
    const res = await admin
      .post(`/api/customers/${c.body.id}/photo`)
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: 'face.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.photoUrl).toMatch(/^\/uploads\//);
    expect((await admin.get(res.body.photoUrl)).status).toBe(200);
  });
});

describe('automatic customer numbers (#3)', () => {
  it('stay unique after an earlier customer is deleted', async () => {
    const created = [];
    for (let i = 0; i < 3; i++) {
      created.push((await admin.post('/api/customers').send({ name: `Auto ${i}`, mobile: String(9811100000 + i) })).body);
    }
    expect((await admin.delete(`/api/customers/${created[0].id}`)).status).toBe(204);
    const next = await admin.post('/api/customers').send({ name: 'After delete', mobile: '9811100009' });
    expect(next.status).toBe(201);
    const numbers = (await admin.get('/api/customers')).body.map((c: { customerNumber: string }) => c.customerNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('continue after the highest C-number, even one typed by hand', async () => {
    await admin.post('/api/customers').send({ name: 'Manual', mobile: '9811100010', customerNumber: 'C0500' });
    const next = await admin.post('/api/customers').send({ name: 'Next', mobile: '9811100011' });
    expect(next.body.customerNumber).toBe('C0501');
  });

  it('ignore non-numeric custom numbers', async () => {
    await admin.post('/api/customers').send({ name: 'Custom', mobile: '9811100012', customerNumber: 'CHENNAI-7' });
    const next = await admin.post('/api/customers').send({ name: 'Next', mobile: '9811100013' });
    expect(next.status).toBe(201);
    expect(next.body.customerNumber).toMatch(/^C\d{4,}$/);
  });
});
