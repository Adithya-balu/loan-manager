import type { InstallmentStatus, LoanFrequency, LoanStatus, RiskBand } from './types';

const currencyFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const compactFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return currencyFmt.format(value);
}

export function formatCompactCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return compactFmt.format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-IN').format(value);
}

/** Format an ISO date (or Date) as a readable day. Date-only, timezone-safe. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Today's date as yyyy-mm-dd for date inputs. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Convert any ISO datetime string to yyyy-mm-dd for a date input value. */
export function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}

export const FREQUENCY_LABEL: Record<LoanFrequency, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
};

export const STATUS_TONE: Record<InstallmentStatus, 'gray' | 'blue' | 'green' | 'amber' | 'red'> = {
  SCHEDULED: 'gray',
  DUE: 'blue',
  PARTIAL: 'amber',
  PAID: 'green',
  OVERDUE: 'red',
  DEFAULTED: 'red',
};

export const LOAN_STATUS_TONE: Record<LoanStatus, 'green' | 'gray' | 'red'> = {
  ACTIVE: 'green',
  CLOSED: 'gray',
  DEFAULTED: 'red',
};

export const RISK_TONE: Record<RiskBand, 'green' | 'amber' | 'red' | 'gray'> = {
  LOW: 'green',
  MEDIUM: 'amber',
  HIGH: 'red',
  UNKNOWN: 'gray',
};
