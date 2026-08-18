// Client-facing response shapes. Base domain types come from @loan/shared;
// the types here describe the *enriched* JSON the API returns on top of them.
import type {
  Customer,
  CustomerDocument,
  Installment,
  InstallmentStatus,
  Loan,
  LoanFrequency,
  Payment,
  PaymentMode,
  RiskResult,
} from '@loan/shared';

export type {
  AppConfig,
  Customer,
  CustomerDocument,
  Installment,
  InstallmentStatus,
  InterestMethod,
  Loan,
  LoanFrequency,
  LoanStatus,
  LoanTypeConfig,
  Payment,
  PaymentMode,
  RiskBand,
  RiskResult,
  ScheduleRow,
  ScheduleSummary,
} from '@loan/shared';

/** Money + status aggregates the API attaches to a loan. */
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

/** Installment plus derived, reference-day-relative fields. */
export interface EnrichedInstallment extends Installment {
  remaining: number;
  daysPastDue: number;
  derivedStatus: InstallmentStatus;
  actionRequired: boolean;
}

export interface LoanListItem extends Loan {
  customer: Customer;
  rollup: LoanRollup;
}

export interface PaymentWithInstallment extends Payment {
  installment?: { sequence: number } | null;
}

export interface LoanDetail extends Loan {
  customer: Customer;
  schedule: EnrichedInstallment[];
  payments: PaymentWithInstallment[];
  rollup: LoanRollup;
  effectiveGraceDays: number;
}

export interface CustomerListItem {
  id: string;
  customerNumber: string;
  name: string;
  mobile: string;
  email?: string | null;
  address?: string | null;
  documentCount: number;
  loanCount: number;
  activeLoans: number;
  outstanding: number;
  risk: RiskResult;
  createdAt: string;
}

export interface CustomerDetail {
  customer: Customer & {
    documents: CustomerDocument[];
    loans: (Loan & { schedule: Installment[]; payments: Payment[] })[];
  };
  risk: RiskResult;
  loans: (Loan & { rollup: LoanRollup })[];
  payments: (Payment & { loan: Loan })[];
  totals: { disbursed: number; outstanding: number; collected: number; overdue: number };
}

export interface PaymentListItem extends Payment {
  customer: { id: string; name: string; customerNumber: string };
  loan: { id: string; frequency: LoanFrequency; interestMethod: string };
  installment?: { sequence: number } | null;
}

export interface CollectionItem {
  installmentId: string;
  loanId: string;
  customerId: string;
  customerName: string;
  customerNumber: string;
  sequence: number;
  dueDate: string;
  amountDue: number;
  paidAmount: number;
  remaining: number;
  status: InstallmentStatus;
  daysPastDue: number;
  frequency: LoanFrequency;
  actionRequired: boolean;
}

export interface TodayCollectionResponse {
  date: string;
  totals: { dueToday: number; overdue: number; count: number };
  items: CollectionItem[];
}

export interface InstallmentAction {
  installmentId: string;
  loanId: string;
  customerId: string;
  customerName: string;
  customerNumber: string;
  sequence: number;
  dueDate: string;
  amountDue: number;
  paidAmount: number;
  remaining: number;
  daysPastDue: number;
  graceDays: number;
  kind: 'PARTIAL' | 'DEFAULT';
  frequency: LoanFrequency;
}

export interface LoanAction {
  loanId: string;
  customerId: string;
  customerName: string;
  customerNumber: string;
  frequency: LoanFrequency;
  outstanding: number;
  lastPaymentDate: string | null;
  nextDueDate: string | null;
}

export interface ActionRequiredResponse {
  installmentActions: InstallmentAction[];
  loanActions: LoanAction[];
  total: number;
}

export interface DashboardResponse {
  kpis: {
    totalDisbursed: number;
    outstanding: number;
    interestEarned: number;
    overdueAmount: number;
    activeLoans: number;
    closedLoans: number;
    defaultedLoans: number;
    totalCustomers: number;
    collectionEfficiency: number;
  };
  collections: { today: number; week: number; month: number };
  portfolio: Record<LoanFrequency, { count: number; outstanding: number }>;
  trend: { month: string; disbursed: number; collected: number }[];
  actionRequiredCount: number;
  topRisk: { id: string; name: string; customerNumber: string; risk: RiskResult }[];
}

export interface CapitalizeResult {
  capitalized: number;
  reamortized: number;
  loanDefaulted: boolean;
}

/** Payload for creating/updating a loan. */
export interface LoanInput {
  customerId: string;
  principal: number;
  annualRatePct: number;
  frequency: LoanFrequency;
  interestMethod: 'FLAT' | 'REDUCING';
  installments: number;
  disbursementDate: string;
  repaymentStartDate: string;
  graceDaysOverride?: number | null;
  defaultThresholdDaysOverride?: number | null;
}

export interface PaymentInput {
  loanId: string;
  installmentId?: string | null;
  amount: number;
  date: string;
  mode?: PaymentMode;
  note?: string | null;
}

export interface CustomerInput {
  name: string;
  mobile: string;
  customerNumber?: string;
  email?: string | null;
  address?: string | null;
}
