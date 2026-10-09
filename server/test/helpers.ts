import request from 'supertest';
import { expect } from 'vitest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/auth.js';
import { today } from '../src/lib/dates.js';

export { app, prisma };

/**
 * One server per test file, bound explicitly to 127.0.0.1. supertest's default
 * (listen on all interfaces, then connect to 127.0.0.1) can land on another
 * local process that holds the same port on 127.0.0.1 — macOS allows both
 * binds — which showed up as random 404s and hangs.
 */
export const server = app.listen(0, '127.0.0.1');
server.unref();

export const ADMIN = { email: 'admin@loanmanager.local', password: 'admin123' };
export const AGENT = { email: 'agent@loanmanager.local', password: 'agent123' };

// bcrypt at cost 12 is slow; hash the fixture passwords once per test file.
let hashes: Promise<[string, string]> | null = null;

/** Empty every table and recreate the two fixture users. */
export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Payment", "Installment", "LoanDocument", "Loan", "CustomerDocument", "Customer", "User", "LoanTypeSetting", "CompanyProfile" CASCADE',
  );
  hashes ??= Promise.all([hashPassword(ADMIN.password), hashPassword(AGENT.password)]);
  const [adminHash, agentHash] = await hashes;
  await prisma.user.createMany({
    data: [
      { name: 'Admin', email: ADMIN.email, passwordHash: adminHash, role: 'ADMIN' },
      { name: 'Agent', email: AGENT.email, passwordHash: agentHash, role: 'AGENT' },
    ],
  });
}

export type Client = ReturnType<typeof request.agent>;

/** A cookie-keeping client already logged in with the given credentials. */
export async function login(creds = ADMIN): Promise<Client> {
  const client = request.agent(server);
  const res = await client.post('/api/auth/login').send(creds);
  expect(res.status).toBe(200);
  return client;
}

/** yyyy-mm-dd for the server's business "today" plus `offset` days. */
export function iso(offset = 0): string {
  const d = today();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

let seq = 0;

export async function createCustomer(client: Client, extra: Record<string, unknown> = {}) {
  seq += 1;
  const res = await client
    .post('/api/customers')
    .send({ name: `Customer ${seq}`, mobile: String(9000000000 + seq), ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; customerNumber: string };
}

/** Weekly flat loan by default: 10 000 at 24% over 10 installments, starting next week. */
export async function createLoan(client: Client, customerId: string, extra: Record<string, unknown> = {}) {
  const res = await client.post('/api/loans').send({
    customerId,
    principal: 10000,
    annualRatePct: 24,
    frequency: 'WEEKLY',
    interestMethod: 'FLAT',
    installments: 10,
    disbursementDate: iso(0),
    repaymentStartDate: iso(7),
    ...extra,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string };
}

export interface LoanView {
  id: string;
  status: 'ACTIVE' | 'CLOSED' | 'DEFAULTED';
  schedule: { id: string; sequence: number; amountDue: number; paidAmount: number; derivedStatus: string; remaining: number }[];
  payments: { id: string; amount: number; kind?: string }[];
  rollup: { totalPaid: number; outstanding: number; overdueAmount: number; totalPayable: number; loanDefaultEligible: boolean };
}

export async function getLoan(client: Client, id: string): Promise<LoanView> {
  const res = await client.get(`/api/loans/${id}`);
  expect(res.status).toBe(200);
  return res.body;
}

export async function pay(client: Client, loanId: string, amount: number, date = iso(0), extra: Record<string, unknown> = {}) {
  return client.post('/api/payments').send({ loanId, amount, date, ...extra });
}

/** Paid amount per installment, for compact assertions. */
export const paidAmounts = (loan: LoanView) => loan.schedule.map((i) => i.paidAmount);
