import type { EnrichedInstallment, LoanDetail, LoanListItem, PaymentWithInstallment } from '../lib/types';

const NOW = '2026-10-01T00:00:00.000Z';

export const customer = {
  id: 'C1',
  customerNumber: 'C0001',
  name: 'Priya',
  mobile: '9000000001',
  documents: [],
  createdAt: NOW,
  updatedAt: NOW,
};

export function installment(sequence: number, over: Partial<EnrichedInstallment> = {}): EnrichedInstallment {
  return {
    id: `I${sequence}`,
    loanId: 'L1',
    sequence,
    dueDate: `2026-10-0${sequence}T00:00:00.000Z`,
    amountDue: 1000,
    principalComponent: 1000,
    interestComponent: 0,
    paidAmount: 0,
    status: 'SCHEDULED',
    capitalizedAmount: 0,
    waivedAmount: 0,
    interestPaid: 0,
    principalPaid: 0,
    remaining: 1000,
    daysPastDue: 0,
    derivedStatus: 'SCHEDULED',
    actionRequired: false,
    ...over,
  };
}

export function payment(over: Partial<PaymentWithInstallment> = {}): PaymentWithInstallment {
  return {
    id: 'P1',
    loanId: 'L1',
    customerId: 'C1',
    installmentId: 'I1',
    amount: 500,
    date: NOW,
    mode: 'CASH',
    note: null,
    kind: 'REGULAR',
    interestAmount: 0,
    principalAmount: 500,
    createdAt: NOW,
    installment: { sequence: 1 },
    ...over,
  };
}

export function loanDetail(over: Partial<LoanDetail> = {}): LoanDetail {
  return {
    id: 'L1',
    customerId: 'C1',
    principal: 3000,
    annualRatePct: 0,
    frequency: 'WEEKLY',
    interestMethod: 'FLAT',
    installments: 3,
    disbursementDate: NOW,
    repaymentStartDate: NOW,
    disbursementMode: 'CASH',
    status: 'ACTIVE',
    createdAt: NOW,
    updatedAt: NOW,
    customer,
    schedule: [
      installment(1, { derivedStatus: 'OVERDUE', daysPastDue: 9, actionRequired: true }),
      installment(2, { derivedStatus: 'OVERDUE', daysPastDue: 2 }),
      installment(3),
    ],
    payments: [],
    documents: [],
    effectiveGraceDays: 3,
    rollup: {
      totalPayable: 3000,
      totalPaid: 0,
      interestCollected: 0,
      principalCollected: 0,
      outstandingPrincipal: 3000,
      outstanding: 3000,
      totalPrincipal: 3000,
      totalInterest: 0,
      overdueAmount: 2000,
      paidInstallments: 0,
      openInstallments: 3,
      nextDueDate: NOW,
      actionRequiredCount: 1,
      loanDefaultEligible: false,
      lastPaymentDate: null,
    },
    ...over,
  };
}

export function loanListItem(id: string, frequency: LoanListItem['frequency'], status: LoanListItem['status'] = 'ACTIVE'): LoanListItem {
  const { schedule: _s, payments: _p, documents: _d, effectiveGraceDays: _g, ...rest } = loanDetail({ id, frequency, status });
  return { ...rest, customer: { ...customer, name: `Borrower ${id}` } } as LoanListItem;
}
