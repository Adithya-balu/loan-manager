import { PrismaClient } from '@prisma/client';
import {
  generateSchedule,
  toISODate,
  round2,
  type InterestMethod,
  type LoanFrequency,
} from '@loan/shared';
import { hashPassword } from '../src/lib/auth.js';

const prisma = new PrismaClient();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

interface SeedLoan {
  principal: number;
  annualRatePct: number;
  frequency: LoanFrequency;
  interestMethod: InterestMethod;
  installments: number;
  disbursedDaysAgo: number;
  /** How many of the earliest installments to mark as paid on-time. */
  payFirst: number;
  /** Simulate a late/partial situation on the next open installment. */
  scenario?: 'clean' | 'partial' | 'overdue';
}

async function createLoan(customerId: string, s: SeedLoan) {
  const disbursement = daysAgo(s.disbursedDaysAgo);
  const repaymentStart = new Date(disbursement.getTime());
  const summary = generateSchedule({
    principal: s.principal,
    annualRatePct: s.annualRatePct,
    frequency: s.frequency,
    installments: s.installments,
    startDate: toISODate(repaymentStart),
    method: s.interestMethod,
  });

  const loan = await prisma.loan.create({
    data: {
      customerId,
      principal: s.principal,
      annualRatePct: s.annualRatePct,
      frequency: s.frequency,
      interestMethod: s.interestMethod,
      installments: s.installments,
      disbursementDate: disbursement,
      repaymentStartDate: repaymentStart,
      schedule: {
        create: summary.rows.map((r) => ({
          sequence: r.sequence,
          dueDate: new Date(r.dueDate),
          amountDue: r.amountDue,
          principalComponent: r.principalComponent,
          interestComponent: r.interestComponent,
        })),
      },
    },
    include: { schedule: { orderBy: { sequence: 'asc' } } },
  });

  // Pay the first N installments on time.
  for (let i = 0; i < s.payFirst && i < loan.schedule.length; i++) {
    const inst = loan.schedule[i];
    await prisma.installment.update({
      where: { id: inst.id },
      data: { paidAmount: inst.amountDue, status: 'PAID', paidDate: inst.dueDate },
    });
    await prisma.payment.create({
      data: {
        loanId: loan.id,
        customerId,
        installmentId: inst.id,
        amount: inst.amountDue,
        date: inst.dueDate,
        mode: 'CASH',
      },
    });
  }

  // Optional scenario on the next open installment.
  const next = loan.schedule[s.payFirst];
  if (next && s.scenario === 'partial') {
    const part = round2(next.amountDue * 0.4);
    await prisma.installment.update({
      where: { id: next.id },
      data: { paidAmount: part, status: 'PARTIAL' },
    });
    await prisma.payment.create({
      data: {
        loanId: loan.id,
        customerId,
        installmentId: next.id,
        amount: part,
        date: next.dueDate,
        mode: 'UPI',
      },
    });
  }
  return loan;
}

async function main() {
  console.log('Resetting data...');
  await prisma.payment.deleteMany();
  await prisma.installment.deleteMany();
  await prisma.loan.deleteMany();
  await prisma.customerDocument.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.loanTypeSetting.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({
    data: [
      {
        name: 'Admin',
        email: 'admin@loanmanager.local',
        passwordHash: await hashPassword('admin123'),
        role: 'ADMIN',
      },
      {
        name: 'Collection Agent',
        email: 'agent@loanmanager.local',
        passwordHash: await hashPassword('agent123'),
        role: 'AGENT',
      },
    ],
  });
  console.log('Seeded users: admin@loanmanager.local / admin123 (ADMIN), agent@loanmanager.local / agent123 (AGENT)');

  await prisma.loanTypeSetting.createMany({
    data: [
      { frequency: 'DAILY', graceDays: 2, defaultThresholdDays: 5 },
      { frequency: 'WEEKLY', graceDays: 5, defaultThresholdDays: 14 },
      { frequency: 'MONTHLY', graceDays: 7, defaultThresholdDays: 21 },
    ],
  });

  const customers = await Promise.all(
    [
      { customerNumber: 'C0001', name: 'Ravi Kumar', mobile: '9876543210', email: 'ravi@example.com', address: 'Anna Nagar, Chennai' },
      { customerNumber: 'C0002', name: 'Priya Sharma', mobile: '9812345678', email: 'priya@example.com', address: 'Koramangala, Bengaluru' },
      { customerNumber: 'C0003', name: 'Mohammed Ali', mobile: '9900112233', email: 'ali@example.com', address: 'Charminar, Hyderabad' },
      { customerNumber: 'C0004', name: 'Lakshmi Nair', mobile: '9445566778', email: 'lakshmi@example.com', address: 'Fort Kochi, Kerala' },
    ].map((c) => prisma.customer.create({ data: c })),
  );

  // Ravi: solid payer (daily), low risk.
  await createLoan(customers[0].id, {
    principal: 20000, annualRatePct: 24, frequency: 'DAILY', interestMethod: 'FLAT',
    installments: 100, disbursedDaysAgo: 30, payFirst: 30, scenario: 'clean',
  });

  // Priya: weekly reducing, recently overdue (action required).
  await createLoan(customers[1].id, {
    principal: 50000, annualRatePct: 18, frequency: 'WEEKLY', interestMethod: 'REDUCING',
    installments: 20, disbursedDaysAgo: 70, payFirst: 7, scenario: 'overdue',
  });

  // Mohammed: monthly flat, one partial payment (action required).
  await createLoan(customers[2].id, {
    principal: 100000, annualRatePct: 15, frequency: 'MONTHLY', interestMethod: 'FLAT',
    installments: 12, disbursedDaysAgo: 120, payFirst: 3, scenario: 'partial',
  });

  // Lakshmi: fresh daily loan, no history yet (unknown risk).
  await createLoan(customers[3].id, {
    principal: 15000, annualRatePct: 24, frequency: 'DAILY', interestMethod: 'REDUCING',
    installments: 60, disbursedDaysAgo: 1, payFirst: 1, scenario: 'clean',
  });

  console.log('Seed complete:', customers.length, 'customers created.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
