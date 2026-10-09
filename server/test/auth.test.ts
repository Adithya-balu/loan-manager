import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, AGENT, login, resetDb, server } from './helpers.js';

beforeAll(resetDb);

describe('authentication', () => {
  it('health is public, everything else needs a session', async () => {
    expect((await request(server).get('/api/health')).body).toEqual({ ok: true });
    expect((await request(server).get('/api/customers')).status).toBe(401);
    expect((await request(server).get('/uploads/anything.png')).status).toBe(401);
  });

  it('rejects bad credentials', async () => {
    expect((await request(server).post('/api/auth/login').send({ ...ADMIN, password: 'wrong' })).status).toBe(401);
    expect((await request(server).post('/api/auth/login').send({ email: 'nobody@x.com', password: 'x' })).status).toBe(401);
  });

  it('logs in case-insensitively and never exposes password hashes', async () => {
    const client = request.agent(server);
    const res = await client.post('/api/auth/login').send({ ...ADMIN, email: ADMIN.email.toUpperCase() });
    expect(res.status).toBe(200);
    const me = await client.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(JSON.stringify(me.body)).not.toContain('passwordHash');
    const users = await client.get('/api/auth/users');
    expect(JSON.stringify(users.body)).not.toContain('passwordHash');
  });

  it('logout ends the session', async () => {
    const client = await login(AGENT);
    await client.post('/api/auth/logout');
    expect((await client.get('/api/auth/me')).status).toBe(401);
  });
});

describe('roles', () => {
  it('agents cannot use admin endpoints but can read', async () => {
    const agent = await login(AGENT);
    expect((await agent.put('/api/config').send({ loanTypes: [] })).status).toBe(403);
    expect((await agent.put('/api/company').send({ name: 'x' })).status).toBe(403);
    expect((await agent.get('/api/auth/users')).status).toBe(403);
    expect((await agent.get('/api/company')).status).toBe(200);
    expect((await agent.get('/api/loans')).status).toBe(200);
  });

  it('admin creates users; duplicate email is a 409', async () => {
    const admin = await login();
    expect((await admin.post('/api/auth/users').send({ name: 'Dup', email: AGENT.email, password: 'password1', role: 'AGENT' })).status).toBe(409);
    const res = await admin.post('/api/auth/users').send({ name: 'New', email: 'new@x.com', password: 'password1', role: 'AGENT' });
    expect(res.status).toBe(201);
    await login({ email: 'new@x.com', password: 'password1' });
  });
});

describe('change password', () => {
  it('validates length and switches the password', async () => {
    const admin = await login();
    await admin.post('/api/auth/users').send({ name: 'Pw', email: 'pw@x.com', password: 'password1', role: 'AGENT' });
    const user = await login({ email: 'pw@x.com', password: 'password1' });
    expect((await user.post('/api/auth/change-password').send({ currentPassword: 'password1', newPassword: 'short' })).status).toBe(400);
    // A wrong current password is a validation error, not an expired session (#4).
    const wrong = await user.post('/api/auth/change-password').send({ currentPassword: 'nope', newPassword: 'newpass123' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toBe('Current password is incorrect');
    expect((await user.get('/api/auth/me')).status).toBe(200);
    expect((await user.post('/api/auth/change-password').send({ currentPassword: 'password1', newPassword: 'newpass123' })).status).toBe(200);
    expect((await request(server).post('/api/auth/login').send({ email: 'pw@x.com', password: 'password1' })).status).toBe(401);
  });
});
