import { computeRisk, round2, type RiskInputs, type RiskResult } from '@loan/shared';
import { prisma } from '../db.js';
import { dateOnly, diffDays, today } from './dates.js';

/**
 * Aggregate a customer's repayment behaviour across all their loans and
 * compute a risk score (higher = safer). Only installments that have already
 * matured (due date on or before today) count towards the score.
 */
export async function computeCustomerRisk(customerId: string, ref: Date = today()): Promise<RiskResult> {
  const loans = await prisma.loan.findMany({
    where: { customerId },
    include: { schedule: true },
  });

  let matured = 0;
  let paidOnTime = 0;
  let paidLate = 0;
  let partial = 0;
  let defaulted = 0;
  let delaySum = 0;
  let delayCount = 0;
  let overdueAmount = 0;
  let outstandingAmount = 0;

  for (const loan of loans) {
    for (const inst of loan.schedule) {
      const remaining = round2(inst.amountDue - inst.paidAmount);
      const due = dateOnly(inst.dueDate);
      const isMatured = due.getTime() <= ref.getTime();

      if (inst.status !== 'DEFAULTED' && remaining > 0.005) {
        outstandingAmount = round2(outstandingAmount + remaining);
      }

      if (!isMatured) continue;
      matured++;

      if (inst.status === 'DEFAULTED') {
        defaulted++;
        continue;
      }

      if (remaining <= 0.005) {
        // Fully paid — on time vs late by settlement date.
        if (inst.paidDate) {
          const delay = diffDays(due, dateOnly(inst.paidDate));
          if (delay <= 0) {
            paidOnTime++;
          } else {
            paidLate++;
            delaySum += delay;
            delayCount++;
          }
        } else {
          paidOnTime++;
        }
      } else {
        // Matured but not fully settled.
        if (inst.paidAmount > 0) partial++;
        overdueAmount = round2(overdueAmount + remaining);
        const delay = diffDays(due, ref);
        if (delay > 0) {
          delaySum += delay;
          delayCount++;
        }
      }
    }
  }

  const inputs: RiskInputs = {
    matured,
    paidOnTime,
    paidLate,
    partial,
    defaulted,
    avgDelayDays: delayCount > 0 ? delaySum / delayCount : 0,
    overdueAmount,
    outstandingAmount,
  };

  return computeRisk(inputs);
}
