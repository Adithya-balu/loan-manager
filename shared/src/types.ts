// Shared domain types used by both the server and the client.

export type LoanFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type InterestMethod = 'FLAT' | 'REDUCING';
export type LoanStatus = 'ACTIVE' | 'CLOSED' | 'DEFAULTED';

/** SETTLEMENT = the single payment recorded when a loan is pre-closed. */
export type PaymentKind = 'REGULAR' | 'SETTLEMENT';

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

/** Error messages the API returns for unique-constraint violations (shared so forms can match them). */
export const DUPLICATE_CUSTOMER_NUMBER = 'Customer number already exists';
export const DUPLICATE_USER_EMAIL = 'A user with that email already exists';

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
  photoUrl?: string | null;
  aadhaar?: string | null;
  location?: string | null;
  documents: CustomerDocument[];
  createdAt: string;
  updatedAt: string;
}

export interface LoanDocument {
  id: string;
  label: string;
  fileName: string;
  url: string;
  mimeType: string;
  uploadedAt: string;
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
  disbursementMode: PaymentMode;
  guarantorName?: string | null;
  guarantorMobile?: string | null;
  guarantorRelation?: string | null;
  guarantorAddress?: string | null;
  status: LoanStatus;
  graceDaysOverride?: number | null;
  defaultThresholdDaysOverride?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyProfile {
  id: string;
  name: string;
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  updatedAt: string;
}

export interface SettlementQuote {
  loanId: string;
  asOf: string;
  overdueDue: number;
  remainingPrincipal: number;
  interestToDate: number;
  settlementAmount: number;
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
  /** Interest written off on early settlement (included in paidAmount, never received). */
  waivedAmount: number;
  /** paidAmount split, interest first: interestPaid + principalPaid + waivedAmount = paidAmount. */
  interestPaid: number;
  principalPaid: number;
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
  kind: PaymentKind;
  settlementInterest?: number | null;
  /** How the amount was applied; interest is collected before principal. */
  interestAmount: number;
  principalAmount: number;
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
