import type { Installment, Loan, LoanFrequency, Prisma } from '@prisma/client';
import {
  generateSchedule,
  parseISODate,
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
  loan: Loan & { schedule: Installment[]; payments: { date: Date; amount: number }[] },
  settings: Record<LoanFrequency, { graceDays: number; defaultThresholdDays: number }>,
  ref: Date = today(),
): LoanRollup {
  const grace = effectiveGraceDays(loan, settings);
  const enriched = loan.schedule.map((i) => enrichInstallment(i, grace, ref));

  const totalPayable = round2(loan.schedule.reduce((a, i) => a + i.amountDue, 0));
  // Cash actually received. Installment paid amounts can include interest
  // waived at settlement, so they aren't a reliable measure of collections.
  const totalPaid = round2(loan.payments.reduce((a, p) => a + p.amount, 0));
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

export type DisbursementMode = 'CASH' | 'UPI' | 'BANK' | 'CHEQUE' | 'OTHER';

export interface CreateLoanInput {
  customerId: string;
  principal: number;
  annualRatePct: number;
  frequency: LoanFrequency;
  interestMethod: InterestMethod;
  installments: number;
  disbursementDate: string;
  repaymentStartDate: string;
  disbursementMode?: DisbursementMode;
  guarantorName?: string | null;
  guarantorMobile?: string | null;
  guarantorRelation?: string | null;
  guarantorAddress?: string | null;
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
      disbursementMode: input.disbursementMode ?? 'CASH',
      guarantorName: input.guarantorName ?? null,
      guarantorMobile: input.guarantorMobile ?? null,
      guarantorRelation: input.guarantorRelation ?? null,
      guarantorAddress: input.guarantorAddress ?? null,
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
 * How much more money an installment can absorb. A DEFAULTED (capitalized)
 * installment keeps exactly the cash it held when it was capitalized — its
 * unpaid remainder moved into later installments — so during a replay it is
 * refilled up to that amount and never beyond.
 */
function capacityOf(i: Installment) {
  const ceiling = i.status === 'DEFAULTED' ? i.amountDue - i.capitalizedAmount : i.amountDue;
  return round2(ceiling - i.paidAmount);
}

/** An installment a collector can still collect on: not defaulted and not fully paid. */
function isOpenInstallment(i: Installment) {
  return i.status !== 'DEFAULTED' && capacityOf(i) > 0.005;
}

/**
 * Apply a single payment's amount across a loan's installments, always in
 * sequence order starting from the oldest one with capacity left. Partial
 * payments and overpayments are supported; leftover money after the last
 * installment is credited onto the final regular installment (reducing
 * outstanding). Works on an in-memory schedule (mutated in place) so a full
 * replay costs one read and one write per installment rather than several
 * queries per payment. Returns the installment the payment starts on.
 */
function allocatePayment(schedule: Installment[], amount: number, date: Date): string | null {
  const open = schedule.filter((i) => capacityOf(i) > 0.005);
  const regularOpen = open.filter((i) => i.status !== 'DEFAULTED');
  let remaining = round2(amount);

  for (let i = 0; i < open.length && remaining > 0.005; i++) {
    const inst = open[i];
    const apply = Math.min(remaining, capacityOf(inst));
    inst.paidAmount = round2(inst.paidAmount + apply);
    remaining = round2(remaining - apply);
    if (inst.status === 'DEFAULTED') continue;
    const fullyPaid = inst.paidAmount >= round2(inst.amountDue) - 0.005;
    inst.status = fullyPaid ? 'PAID' : 'PARTIAL';
    if (fullyPaid) inst.paidDate ??= date;
  }

  // Leftover overpayment → credit the final open regular installment (reduces outstanding).
  if (remaining > 0.005 && regularOpen.length > 0) {
    const last = regularOpen[regularOpen.length - 1];
    last.paidAmount = round2(last.paidAmount + remaining);
    last.status = 'PAID';
    last.paidDate ??= date;
  }

  return regularOpen[0]?.id ?? null;
}

/** Persist installments whose allocation fields differ from `before`. */
async function saveAllocation(tx: TxClient, before: Installment[], after: Installment[]) {
  const prev = new Map(before.map((i) => [i.id, i]));
  for (const inst of after) {
    const old = prev.get(inst.id);
    if (
      old &&
      old.paidAmount === inst.paidAmount &&
      old.status === inst.status &&
      old.waivedAmount === inst.waivedAmount &&
      old.paidDate?.getTime() === inst.paidDate?.getTime()
    ) {
      continue;
    }
    await tx.installment.update({
      where: { id: inst.id },
      data: {
        paidAmount: inst.paidAmount,
        status: inst.status,
        paidDate: inst.paidDate,
        waivedAmount: inst.waivedAmount,
      },
    });
  }
}

const allSettled = (schedule: Installment[]) =>
  schedule.every((i) => i.status === 'PAID' || i.status === 'DEFAULTED');

/**
 * Rebuild every installment's paid amount from scratch by replaying the
 * loan's regular payments in chronological order. Used after editing or
 * deleting a payment, since a single payment's amount can be spread across
 * several installments and there's no cheap way to "undo" just one without
 * recomputing the whole allocation from the ground up.
 *
 * Capitalized (DEFAULTED) installments are refilled first, oldest-first like
 * everything else, up to the cash they held when capitalized. If the
 * remaining payments can no longer cover that, the change is rejected: the
 * capitalized amount was computed from money that would no longer exist.
 * Any settlement is undone too — callers only replay a settled loan when
 * its settlement payment is being deleted.
 */
async function replayLoanPayments(tx: TxClient, loanId: string) {
  const loan = await tx.loan.findUniqueOrThrow({
    where: { id: loanId },
    include: { schedule: { orderBy: { sequence: 'asc' } } },
  });
  const payments = await tx.payment.findMany({
    where: { loanId, kind: 'REGULAR' },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });

  const schedule = loan.schedule.map((inst) => ({
    ...inst,
    paidAmount: 0,
    waivedAmount: 0,
    ...(inst.status === 'DEFAULTED' ? {} : { status: 'SCHEDULED' as const, paidDate: null }),
  }));
  for (const p of payments) allocatePayment(schedule, p.amount, p.date);

  const shortfall = schedule.find((i) => i.status === 'DEFAULTED' && capacityOf(i) > 0.005);
  if (shortfall) {
    throw new Error(
      `This change would remove money already counted in capitalized installment #${shortfall.sequence}, so it can't be made.`,
    );
  }

  await saveAllocation(tx, loan.schedule, schedule);

  if (loan.status === 'DEFAULTED') return;
  const settled = allSettled(schedule);
  if (settled && loan.status !== 'CLOSED') {
    await tx.loan.update({ where: { id: loanId }, data: { status: 'CLOSED' } });
  } else if (!settled && loan.status === 'CLOSED') {
    await tx.loan.update({ where: { id: loanId }, data: { status: 'ACTIVE' } });
  }
}

/** Settled loans are frozen: only deleting the settlement itself may change their payments. */
async function assertNotSettled(tx: TxClient, loanId: string) {
  const settlement = await tx.payment.findFirst({ where: { loanId, kind: 'SETTLEMENT' } });
  if (settlement) {
    throw new Error('This loan was settled. Delete the settlement payment first to change earlier payments.');
  }
}

/** Reject payment dates that fall before the loan was disbursed. */
function assertPaymentDateAllowed(disbursementDate: Date, payDate: Date) {
  if (dateOnly(payDate).getTime() < dateOnly(disbursementDate).getTime()) {
    throw new Error("Payment date can't be before the loan's disbursement date");
  }
}

/**
 * Record a collection. The amount is allocated across open installments in
 * sequence order, oldest first. If the caller names an installment it must be
 * the oldest open one — collectors can't skip ahead of an earlier due.
 * Partial payments and overpayments are supported; leftover money after the last
 * installment is credited onto the final installment (reducing outstanding).
 */
export async function recordPayment(input: RecordPaymentInput) {
  const payDate = new Date(input.date);
  return prisma.$transaction(async (tx) => {
    const loan = await tx.loan.findUniqueOrThrow({ where: { id: input.loanId } });
    assertPaymentDateAllowed(loan.disbursementDate, payDate);

    const before = await tx.installment.findMany({
      where: { loanId: loan.id },
      orderBy: { sequence: 'asc' },
    });
    if (input.installmentId) {
      const firstOpen = before.find(isOpenInstallment);
      if (firstOpen && firstOpen.id !== input.installmentId) {
        throw new Error(
          `Installments must be collected in order — collect installment #${firstOpen.sequence} first`,
        );
      }
    }

    const schedule = before.map((i) => ({ ...i }));
    const primaryInstallmentId = allocatePayment(schedule, input.amount, payDate);
    await saveAllocation(tx, before, schedule);

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
    if (allSettled(schedule) && loan.status === 'ACTIVE') {
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
    if (existing.kind === 'SETTLEMENT') {
      throw new Error("Settlement payments can't be edited. Delete it to undo the settlement, then re-settle.");
    }
    await assertNotSettled(tx, existing.loanId);
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

/**
 * Delete a payment and replay the loan's remaining payment history. Deleting
 * a settlement payment undoes the settlement and reopens the loan.
 */
export async function deletePayment(paymentId: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (existing.kind !== 'SETTLEMENT') await assertNotSettled(tx, existing.loanId);
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

export interface SettlementQuote {
  loanId: string;
  asOf: string;
  /** Unpaid remaining on matured (DUE/OVERDUE) installments. */
  overdueDue: number;
  /** Unpaid principal component of installments not yet matured. */
  remainingPrincipal: number;
  /** Pro-rated interest on the remaining principal from the last due date to today. */
  interestToDate: number;
  /** Total early-settlement figure. */
  settlementAmount: number;
}

/**
 * Compute an early-settlement (foreclosure) quote for a loan as of `ref`.
 *
 * settlementAmount = overdueDue + remainingPrincipal + interestToDate
 *  - overdueDue:        unpaid remaining of installments already due (matured).
 *  - remainingPrincipal: unpaid principal slice of future (not-yet-due) installments;
 *                        future scheduled interest is waived on early settlement.
 *  - interestToDate:     simple daily-pro-rated interest on remainingPrincipal from the
 *                        most recent due date up to `ref` (annualRatePct / 365 / day).
 */
export function computeSettlement(
  loan: Loan & { schedule: Installment[] },
  settings: Record<LoanFrequency, { graceDays: number; defaultThresholdDays: number }>,
  ref: Date = today(),
): SettlementQuote {
  const grace = effectiveGraceDays(loan, settings);
  const enriched = loan.schedule.map((i) => enrichInstallment(i, grace, ref));
  const open = enriched.filter(
    (i) => i.derivedStatus !== 'PAID' && i.derivedStatus !== 'DEFAULTED' && i.remaining > 0.005,
  );

  const refDay = dateOnly(ref);
  let overdueDue = 0;
  let remainingPrincipal = 0;
  let lastDueOnOrBefore: Date | null = null;

  for (const inst of open) {
    const due = dateOnly(inst.dueDate);
    if (due.getTime() <= refDay.getTime()) {
      // Matured installment: whole remaining amount (principal + its interest) is owed.
      overdueDue = round2(overdueDue + inst.remaining);
      if (!lastDueOnOrBefore || due.getTime() > lastDueOnOrBefore.getTime()) {
        lastDueOnOrBefore = due;
      }
    } else {
      // Future installment: only the unpaid principal slice is owed on early settlement.
      const paidTowardPrincipal = Math.max(0, inst.paidAmount - inst.interestComponent);
      const unpaidPrincipal = Math.max(0, round2(inst.principalComponent - paidTowardPrincipal));
      remainingPrincipal = round2(remainingPrincipal + unpaidPrincipal);
    }
  }

  const anchor = lastDueOnOrBefore ?? dateOnly(loan.disbursementDate);
  const daysElapsed = Math.max(0, diffDays(anchor, refDay));
  const dailyRate = loan.annualRatePct / 100 / 365;
  const interestToDate = round2(remainingPrincipal * dailyRate * daysElapsed);
  const settlementAmount = round2(overdueDue + remainingPrincipal + interestToDate);

  return {
    loanId: loan.id,
    asOf: toISODate(refDay),
    overdueDue,
    remainingPrincipal,
    interestToDate,
    settlementAmount,
  };
}

/**
 * Settle (pre-close) a loan as of `opts.date`: record a single settlement
 * payment for the amount quoted on that date, mark all open installments PAID,
 * and close the loan.
 */
export async function settleLoan(
  loanId: string,
  opts: { date: string; mode?: DisbursementMode },
) {
  const payDate = parseISODate(opts.date);
  return prisma.$transaction(async (tx) => {
    const loan = await tx.loan.findUniqueOrThrow({
      where: { id: loanId },
      include: { schedule: { orderBy: { sequence: 'asc' } } },
    });
    if (loan.status !== 'ACTIVE') throw new Error('Only active loans can be settled');
    assertPaymentDateAllowed(loan.disbursementDate, payDate);

    const settings = await getSettingsMap();
    const quote = computeSettlement(loan, settings, payDate);
    if (quote.settlementAmount <= 0.005) throw new Error('Nothing outstanding to settle');

    const payment = await tx.payment.create({
      data: {
        loanId: loan.id,
        customerId: loan.customerId,
        installmentId: null,
        amount: quote.settlementAmount,
        date: payDate,
        mode: opts.mode ?? 'CASH',
        note: `Settlement / foreclosure (principal ${quote.remainingPrincipal}, interest ${quote.interestToDate}, overdue ${quote.overdueDue})`,
        kind: 'SETTLEMENT',
        settlementInterest: quote.interestToDate,
      },
    });

    // Close out every open installment as paid. Matured ones were owed in full;
    // for future ones only the unpaid principal was collected, so their unpaid
    // scheduled interest is recorded as waived rather than earned.
    const refDay = dateOnly(payDate).getTime();
    for (const inst of loan.schedule) {
      if (inst.status === 'DEFAULTED') continue;
      const remaining = round2(inst.amountDue - inst.paidAmount);
      if (remaining <= 0.005) continue;
      const matured = dateOnly(inst.dueDate).getTime() <= refDay;
      const waivedAmount = matured
        ? 0
        : Math.max(0, round2(inst.interestComponent - Math.min(inst.paidAmount, inst.interestComponent)));
      await tx.installment.update({
        where: { id: inst.id },
        data: { paidAmount: inst.amountDue, waivedAmount, status: 'PAID', paidDate: inst.paidDate ?? payDate },
      });
    }

    await tx.loan.update({ where: { id: loan.id }, data: { status: 'CLOSED' } });
    return { payment, quote };
  });
}

export type LoanWithRelations = Prisma.LoanGetPayload<{
  include: { schedule: true; customer: true; payments: true };
}>;
