// Shared domain types used by both the server and the client.

export type LoanFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type InterestMethod = 'FLAT' | 'REDUCING';
export type LoanStatus = 'ACTIVE' | 'CLOSED' | 'DEFAULTED';

/**
 * Lifecycle of a single scheduled installment.
 * - SCHEDULED: future installment, not yet due.
 * - DUE: due today / awaiting collection.
 * - PARTIAL: some money collected, shortfall remains.
 * - PAID: fully collected.
 * - OVERDUE: past due date (may still be within grace bandwidth).
 * - DEFAULTED: user confirmed default; unpaid amount was capitalized into principal.
 */
export type InstallmentStatus =
  | 'SCHEDULED'
  | 'DUE'
  | 'PARTIAL'
  | 'PAID'
  | 'OVERDUE'
  | 'DEFAULTED';

export type PaymentMode = 'CASH' | 'UPI' | 'BANK' | 'CHEQUE' | 'OTHER';

export type RiskBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

export const LOAN_FREQUENCIES: LoanFrequency[] = ['DAILY', 'WEEKLY', 'MONTHLY'];
export const INTEREST_METHODS: InterestMethod[] = ['FLAT', 'REDUCING'];
export const PAYMENT_MODES: PaymentMode[] = ['CASH', 'UPI', 'BANK', 'CHEQUE', 'OTHER'];

/** System-wide, per-loan-type configuration (overridable per loan). */
export interface LoanTypeConfig {
  frequency: LoanFrequency;
  /** Days past due date within which a late payment is tolerated before it becomes "action required". */
  graceDays: number;
  /** Days with no payment after which the whole loan is flagged as default-eligible. */
  defaultThresholdDays: number;
}

export interface AppConfig {
  currency: string;
  locale: string;
  loanTypes: LoanTypeConfig[];
}

export interface CustomerDocument {
  id: string;
  label: string;
  fileName: string;
  url: string;
  mimeType: string;
  uploadedAt: string;
}

export interface Customer {
  id: string;
  customerNumber: string;
  name: string;
  mobile: string;
  email?: string | null;
  address?: string | null;
  documents: CustomerDocument[];
  createdAt: string;
  updatedAt: string;
}

export interface Loan {
  id: string;
  customerId: string;
  principal: number;
  annualRatePct: number;
  frequency: LoanFrequency;
  interestMethod: InterestMethod;
  installments: number;
  disbursementDate: string;
  repaymentStartDate: string;
  status: LoanStatus;
  graceDaysOverride?: number | null;
  defaultThresholdDaysOverride?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Installment {
  id: string;
  loanId: string;
  sequence: number;
  dueDate: string;
  amountDue: number;
  principalComponent: number;
  interestComponent: number;
  paidAmount: number;
  status: InstallmentStatus;
  paidDate?: string | null;
  capitalizedAmount: number;
}

export interface Payment {
  id: string;
  loanId: string;
  installmentId?: string | null;
  customerId: string;
  amount: number;
  date: string;
  mode: PaymentMode;
  note?: string | null;
  createdAt: string;
}

/** Inputs to build/preview a repayment schedule. */
export interface ScheduleParams {
  principal: number;
  annualRatePct: number;
  frequency: LoanFrequency;
  installments: number;
  /** ISO date (yyyy-mm-dd) of the first installment. */
  startDate: string;
  method: InterestMethod;
}

export interface ScheduleRow {
  sequence: number;
  dueDate: string;
  openingBalance: number;
  principalComponent: number;
  interestComponent: number;
  amountDue: number;
  closingBalance: number;
}

export interface ScheduleSummary {
  rows: ScheduleRow[];
  totalPrincipal: number;
  totalInterest: number;
  totalPayable: number;
  installmentAmount: number;
}

/** Aggregated repayment behaviour used to compute a customer's risk score. */
export interface RiskInputs {
  /** Installments that have reached their due date so far. */
  matured: number;
  paidOnTime: number;
  paidLate: number;
  partial: number;
  defaulted: number;
  /** Average delay (in days) across late payments. */
  avgDelayDays: number;
  overdueAmount: number;
  outstandingAmount: number;
}

export interface RiskResult {
  /** 0..100, higher = safer / more reliable. null when there is no history yet. */
  score: number | null;
  band: RiskBand;
}
