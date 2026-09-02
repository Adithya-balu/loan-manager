import type { Installment, Loan, LoanFrequency, Prisma } from '@prisma/client';
import {
  generateSchedule,
  reamortizeRemaining,
  round2,
  toISODate,
  type InterestMethod,
} from '@loan/shared';
import { prisma } from '../db.js';
import { dateOnly, diffDays, today } from './dates.js';

export const DEFAULT_SETTINGS: Record<LoanFrequency, { graceDays: number; defaultThresholdDays: number }> = {
  DAILY: { graceDays: 2, defaultThresholdDays: 5 },
  WEEKLY: { graceDays: 5, defaultThresholdDays: 14 },
  MONTHLY: { graceDays: 7, defaultThresholdDays: 21 },
};

export async function getSettingsMap() {
  const rows = await prisma.loanTypeSetting.findMany();
  const map = { ...DEFAULT_SETTINGS } as Record<
    LoanFrequency,
    { graceDays: number; defaultThresholdDays: number }
  >;
  for (const r of rows) {
    map[r.frequency] = { graceDays: r.graceDays, defaultThresholdDays: r.defaultThresholdDays };
  }
  return map;
}

export function effectiveGraceDays(
  loan: Loan,
  settings: Record<LoanFrequency, { graceDays: number; defaultThresholdDays: number }>,
): number {
  return loan.graceDaysOverride ?? settings[loan.frequency].graceDays;
}

export function effectiveDefaultThreshold(
  loan: Loan,
  settings: Record<LoanFrequency, { graceDays: number; defaultThresholdDays: number }>,
): number {
  return loan.defaultThresholdDaysOverride ?? settings[loan.frequency].defaultThresholdDays;
}

export type DerivedStatus =
  | 'SCHEDULED'
  | 'DUE'
  | 'PARTIAL'
  | 'PAID'
  | 'OVERDUE'
  | 'DEFAULTED';

export interface EnrichedInstallment extends Installment {
  remaining: number;
  daysPastDue: number;
  derivedStatus: DerivedStatus;
  actionRequired: boolean;
}

/** Derive the display status of an installment relative to a reference day. */
export function deriveStatus(inst: Installment, ref: Date): DerivedStatus {
  if (inst.status === 'DEFAULTED') return 'DEFAULTED';
  const remaining = round2(inst.amountDue - inst.paidAmount);
  if (remaining <= 0.005) return 'PAID';
  const due = dateOnly(inst.dueDate);
  if (due.getTime() > ref.getTime()) return inst.paidAmount > 0 ? 'PARTIAL' : 'SCHEDULED';
  if (due.getTime() === ref.getTime()) return inst.paidAmount > 0 ? 'PARTIAL' : 'DUE';
  return 'OVERDUE';
}

export function enrichInstallment(
  inst: Installment,
  graceDays: number,
  ref: Date = today(),
): EnrichedInstallment {
  const remaining = round2(inst.amountDue - inst.paidAmount);
  const due = dateOnly(inst.dueDate);
  const daysPastDue = Math.max(0, diffDays(due, ref));
  const derivedStatus = deriveStatus(inst, ref);
  const actionRequired =
    derivedStatus === 'OVERDUE' && daysPastDue > graceDays && remaining > 0.005;
  return { ...inst, remaining, daysPastDue, derivedStatus, actionRequired };
}

export interface LoanRollup {
  totalPayable: number;
  totalPaid: number;
  outstanding: number;
  totalPrincipal: number;
  totalInterest: number;
  overdueAmount: number;
  paidInstallments: number;
  openInstallments: number;
  nextDueDate: string | null;
  actionRequiredCount: number;
  loanDefaultEligible: boolean;
  lastPaymentDate: string | null;
}

/** Aggregate money + status figures for a loan given its schedule and payments. */
export function rollupLoan(
  loan: Loan & { schedule: Installment[]; payments: { date: Date }[] },
  settings: Record<LoanFrequency, { graceDays: number; defaultThresholdDays: number }>,
  ref: Date = today(),
): LoanRollup {
  const grace = effectiveGraceDays(loan, settings);
  const enriched = loan.schedule.map((i) => enrichInstallment(i, grace, ref));

  const totalPayable = round2(loan.schedule.reduce((a, i) => a + i.amountDue, 0));
  const totalPaid = round2(loan.schedule.reduce((a, i) => a + i.paidAmount, 0));
  const totalPrincipal = round2(loan.schedule.reduce((a, i) => a + i.principalComponent, 0));
  const totalInterest = round2(loan.schedule.reduce((a, i) => a + i.interestComponent, 0));
  const outstanding = round2(
    enriched
      .filter((i) => i.derivedStatus !== 'DEFAULTED')
      .reduce((a, i) => a + Math.max(0, i.remaining), 0),
  );
  const overdueAmount = round2(
    enriched
      .filter((i) => i.derivedStatus === 'OVERDUE')
      .reduce((a, i) => a + Math.max(0, i.remaining), 0),
  );
  const paidInstallments = enriched.filter((i) => i.derivedStatus === 'PAID').length;
  const openList = enriched.filter(
    (i) => i.derivedStatus !== 'PAID' && i.derivedStatus !== 'DEFAULTED',
  );
  const nextDue = openList
    .slice()
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
  const actionRequiredCount = enriched.filter((i) => i.actionRequired).length;

  const paymentDates = loan.payments.map((p) => p.date.getTime());
  const lastPaymentMs = paymentDates.length ? Math.max(...paymentDates) : null;
  const lastActivityMs = lastPaymentMs ?? dateOnly(loan.disbursementDate).getTime();
  const gapDays = diffDays(new Date(lastActivityMs), ref);
  const threshold = effectiveDefaultThreshold(loan, settings);
  const loanDefaultEligible =
    loan.status === 'ACTIVE' && openList.length > 0 && gapDays >= threshold;

  return {
    totalPayable,
    totalPaid,
    outstanding,
    totalPrincipal,
    totalInterest,
    overdueAmount,
    paidInstallments,
    openInstallments: openList.length,
    nextDueDate: nextDue ? toISODate(dateOnly(nextDue.dueDate)) : null,
    actionRequiredCount,
    loanDefaultEligible,
    lastPaymentDate: lastPaymentMs ? toISODate(new Date(lastPaymentMs)) : null,
  };
}

export interface CreateLoanInput {
  customerId: string;
  principal: number;
  annualRatePct: number;
  frequency: LoanFrequency;
  interestMethod: InterestMethod;
  installments: number;
  disbursementDate: string;
  repaymentStartDate: string;
  graceDaysOverride?: number | null;
  defaultThresholdDaysOverride?: number | null;
}

export async function createLoanWithSchedule(input: CreateLoanInput) {
  const summary = generateSchedule({
    principal: input.principal,
    annualRatePct: input.annualRatePct,
    frequency: input.frequency,
    installments: input.installments,
    startDate: input.repaymentStartDate,
    method: input.interestMethod,
  });

  return prisma.loan.create({
    data: {
      customerId: input.customerId,
      principal: input.principal,
      annualRatePct: input.annualRatePct,
      frequency: input.frequency,
      interestMethod: input.interestMethod,
      installments: input.installments,
      disbursementDate: new Date(input.disbursementDate),
      repaymentStartDate: new Date(input.repaymentStartDate),
      graceDaysOverride: input.graceDaysOverride ?? null,
      defaultThresholdDaysOverride: input.defaultThresholdDaysOverride ?? null,
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
    include: { schedule: { orderBy: { sequence: 'asc' } }, customer: true },
  });
}

export interface RecordPaymentInput {
  loanId: string;
  installmentId?: string | null;
  amount: number;
  date: string;
  mode?: 'CASH' | 'UPI' | 'BANK' | 'CHEQUE' | 'OTHER';
  note?: string | null;
}

type TxClient = Prisma.TransactionClient;

/**
 * Apply a single payment's amount across a loan's open installments (in
 * sequence order, starting from the chosen installment or the first open
 * one). Partial payments and overpayments are supported; leftover money
 * after the last installment is credited onto the final installment
 * (reducing outstanding). This is the shared core used both when recording a
 * brand-new payment and when replaying a loan's payment history after an
 * edit/delete (see `replayLoanPayments`).
 */
async function applyPaymentAllocation(
  tx: TxClient,
  loanId: string,
  input: { installmentId?: string | null; amount: number; date: Date },
) {
  const schedule = await tx.installment.findMany({
    where: { loanId },
    orderBy: { sequence: 'asc' },
  });

  const open = schedule.filter(
    (i) => i.status !== 'DEFAULTED' && round2(i.amountDue - i.paidAmount) > 0.005,
  );
  let startIdx = 0;
  if (input.installmentId) {
    const idx = open.findIndex((i) => i.id === input.installmentId);
    startIdx = idx >= 0 ? idx : 0;
  }

  let remaining = round2(input.amount);
  const updates: { id: string; paidAmount: number; status: Installment['status']; paidDate: Date | null }[] = [];

  for (let i = startIdx; i < open.length && remaining > 0.005; i++) {
    const inst = open[i];
    const capacity = round2(inst.amountDue - inst.paidAmount);
    const apply = Math.min(remaining, capacity);
    const newPaid = round2(inst.paidAmount + apply);
    remaining = round2(remaining - apply);
    const fullyPaid = newPaid >= round2(inst.amountDue) - 0.005;
    updates.push({
      id: inst.id,
      paidAmount: newPaid,
      status: fullyPaid ? 'PAID' : 'PARTIAL',
      paidDate: fullyPaid ? input.date : inst.paidDate,
    });
  }

  // Leftover overpayment → credit the final open installment (reduces outstanding).
  if (remaining > 0.005 && open.length > 0) {
    const last = open[open.length - 1];
    const existing = updates.find((u) => u.id === last.id);
    if (existing) {
      existing.paidAmount = round2(existing.paidAmount + remaining);
      existing.status = 'PAID';
      existing.paidDate = existing.paidDate ?? input.date;
    } else {
      updates.push({
        id: last.id,
        paidAmount: round2(last.paidAmount + remaining),
        status: 'PAID',
        paidDate: input.date,
      });
    }
    remaining = 0;
  }

  for (const u of updates) {
    await tx.installment.update({
      where: { id: u.id },
      data: { paidAmount: u.paidAmount, status: u.status, paidDate: u.paidDate },
    });
  }

  return { primaryInstallmentId: input.installmentId ?? open[startIdx]?.id ?? null };
}

/** Recompute a loan's status once its payments have been reset/replayed. */
async function syncLoanStatusAfterReplay(tx: TxClient, loanId: string, currentStatus: Loan['status']) {
  if (currentStatus === 'DEFAULTED') return;
  const refreshed = await tx.installment.findMany({ where: { loanId } });
  const allSettled = refreshed.every((i) => i.status === 'PAID' || i.status === 'DEFAULTED');
  if (allSettled && currentStatus !== 'CLOSED') {
    await tx.loan.update({ where: { id: loanId }, data: { status: 'CLOSED' } });
  } else if (!allSettled && currentStatus === 'CLOSED') {
    await tx.loan.update({ where: { id: loanId }, data: { status: 'ACTIVE' } });
  }
}

/**
 * Rebuild every non-defaulted installment's paid amount from scratch by
 * replaying the loan's payments in chronological order. Used after editing
 * or deleting a payment, since a single payment's amount can be spread
 * across several installments and there's no cheap way to "undo" just one
 * without recomputing the whole allocation from the ground up.
 */
async function replayLoanPayments(tx: TxClient, loanId: string) {
  const loan = await tx.loan.findUniqueOrThrow({
    where: { id: loanId },
    include: { schedule: { orderBy: { sequence: 'asc' } } },
  });

  for (const inst of loan.schedule) {
    if (inst.status === 'DEFAULTED') continue;
    await tx.installment.update({
      where: { id: inst.id },
      data: { paidAmount: 0, status: 'SCHEDULED', paidDate: null },
    });
  }

  const payments = await tx.payment.findMany({
    where: { loanId },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });

  for (const p of payments) {
    await applyPaymentAllocation(tx, loanId, {
      installmentId: p.installmentId,
      amount: p.amount,
      date: p.date,
    });
  }

  await syncLoanStatusAfterReplay(tx, loanId, loan.status);
}

/** Reject payment dates that fall before the loan was disbursed. */
function assertPaymentDateAllowed(disbursementDate: Date, payDate: Date) {
  if (dateOnly(payDate).getTime() < dateOnly(disbursementDate).getTime()) {
    throw new Error("Payment date can't be before the loan's disbursement date");
  }
}

/**
 * Record a collection. The amount is allocated across open installments in
 * sequence order (starting from the chosen installment, or the first open one).
 * Partial payments and overpayments are supported; leftover money after the last
 * installment is credited onto the final installment (reducing outstanding).
 */
export async function recordPayment(input: RecordPaymentInput) {
  const payDate = new Date(input.date);
  return prisma.$transaction(async (tx) => {
    const loan = await tx.loan.findUniqueOrThrow({ where: { id: input.loanId } });
    assertPaymentDateAllowed(loan.disbursementDate, payDate);

    const { primaryInstallmentId } = await applyPaymentAllocation(tx, loan.id, {
      installmentId: input.installmentId,
      amount: input.amount,
      date: payDate,
    });

    const payment = await tx.payment.create({
      data: {
        loanId: loan.id,
        customerId: loan.customerId,
        installmentId: primaryInstallmentId,
        amount: round2(input.amount),
        date: payDate,
        mode: input.mode ?? 'CASH',
        note: input.note ?? null,
      },
    });

    // Close the loan if everything is settled.
    const refreshed = await tx.installment.findMany({ where: { loanId: loan.id } });
    const allSettled = refreshed.every(
      (i) => i.status === 'PAID' || i.status === 'DEFAULTED',
    );
    if (allSettled && loan.status === 'ACTIVE') {
      await tx.loan.update({ where: { id: loan.id }, data: { status: 'CLOSED' } });
    }

    return payment;
  });
}

export interface UpdatePaymentInput {
  amount: number;
  date: string;
  mode?: 'CASH' | 'UPI' | 'BANK' | 'CHEQUE' | 'OTHER';
  note?: string | null;
}

/**
 * Edit an existing payment's amount/date/mode/note. Since a payment's amount
 * may be spread across multiple installments, the safest way to reflect the
 * edit is to reset the loan's installments and replay every payment (in
 * chronological order) from scratch.
 */
export async function updatePayment(paymentId: string, input: UpdatePaymentInput) {
  const payDate = new Date(input.date);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const loan = await tx.loan.findUniqueOrThrow({ where: { id: existing.loanId } });
    assertPaymentDateAllowed(loan.disbursementDate, payDate);

    await tx.payment.update({
      where: { id: paymentId },
      data: {
        amount: round2(input.amount),
        date: payDate,
        mode: input.mode ?? existing.mode,
        note: input.note ?? null,
      },
    });

    await replayLoanPayments(tx, existing.loanId);

    return tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
  });
}

/** Delete a payment and replay the loan's remaining payment history. */
export async function deletePayment(paymentId: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    await tx.payment.delete({ where: { id: paymentId } });
    await replayLoanPayments(tx, existing.loanId);
  });
}

/**
 * Confirm a default / partial on an installment: capitalize the unpaid amount
 * into the outstanding principal and re-amortize the remaining installments
 * (same remaining count, interest recomputed on the new outstanding).
 */
export async function capitalizeInstallment(installmentId: string) {
  return prisma.$transaction(async (tx) => {
    const inst = await tx.installment.findUniqueOrThrow({
      where: { id: installmentId },
      include: { loan: { include: { schedule: { orderBy: { sequence: 'asc' } } } } },
    });
    if (inst.status === 'DEFAULTED') throw new Error('Installment already defaulted');

    const loan = inst.loan;
    const unpaid = round2(inst.amountDue - inst.paidAmount);
    if (unpaid <= 0.005) throw new Error('Installment has no unpaid amount to capitalize');

    const remainingOpen = loan.schedule.filter(
      (s) =>
        s.sequence > inst.sequence &&
        s.status !== 'DEFAULTED' &&
        round2(s.amountDue - s.paidAmount) > 0.005,
    );

    // Mark the installment defaulted and capture the capitalized amount.
    await tx.installment.update({
      where: { id: inst.id },
      data: { status: 'DEFAULTED', capitalizedAmount: unpaid },
    });

    if (remainingOpen.length === 0) {
      // Nothing left to re-amortize; flag the loan as defaulted.
      await tx.loan.update({ where: { id: loan.id }, data: { status: 'DEFAULTED' } });
      return { capitalized: unpaid, reamortized: 0, loanDefaulted: true };
    }

    const remainingPrincipal = round2(
      remainingOpen.reduce((a, s) => a + s.principalComponent, 0),
    );
    const newOutstanding = round2(remainingPrincipal + unpaid);
    const sorted = remainingOpen
      .slice()
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    const firstDueDate = toISODate(dateOnly(sorted[0].dueDate));

    const summary = reamortizeRemaining({
      newOutstanding,
      remainingInstallments: sorted.length,
      annualRatePct: loan.annualRatePct,
      frequency: loan.frequency,
      firstDueDate,
      method: loan.interestMethod as InterestMethod,
    });

    for (let i = 0; i < sorted.length; i++) {
      const row = summary.rows[i];
      await tx.installment.update({
        where: { id: sorted[i].id },
        data: {
          amountDue: row.amountDue,
          principalComponent: row.principalComponent,
          interestComponent: row.interestComponent,
        },
      });
    }

    return { capitalized: unpaid, reamortized: sorted.length, loanDefaulted: false };
  });
}

export async function markLoanDefaulted(loanId: string) {
  return prisma.loan.update({ where: { id: loanId }, data: { status: 'DEFAULTED' } });
}

export type LoanWithRelations = Prisma.LoanGetPayload<{
  include: { schedule: true; customer: true; payments: true };
}>;
