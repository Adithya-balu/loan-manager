import type {
  ActionRequiredResponse,
  AppConfig,
  AuthUser,
  CapitalizeResult,
  Customer,
  CustomerDetail,
  CustomerDocument,
  CustomerInput,
  CustomerListItem,
  DashboardResponse,
  Loan,
  LoanDetail,
  LoanInput,
  LoanListItem,
  Payment,
  PaymentInput,
  PaymentListItem,
  ScheduleSummary,
  TodayCollectionResponse,
} from './types';

const BASE = '/api';

/** Fired whenever a request comes back 401 outside of the login/me flow, so the app can force a re-login. */
export const AUTH_EXPIRED_EVENT = 'auth:expired';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // non-JSON error body; keep the default message.
    }
    if (res.status === 401 && path !== '/auth/login' && path !== '/auth/me') {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const put = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) });
const del = <T = void>(path: string) => request<T>(path, { method: 'DELETE' });

export const api = {
  // Auth
  login: (email: string, password: string) => post<AuthUser>('/auth/login', { email, password }),
  logout: () => post<void>('/auth/logout'),
  me: () => get<AuthUser>('/auth/me'),

  // Config
  getConfig: () => get<AppConfig>('/config'),
  updateConfig: (loanTypes: AppConfig['loanTypes']) => put<{ ok: true }>('/config', { loanTypes }),

  // Dashboard
  getDashboard: () => get<DashboardResponse>('/dashboard'),

  // Customers
  listCustomers: () => get<CustomerListItem[]>('/customers'),
  getCustomer: (id: string) => get<CustomerDetail>(`/customers/${id}`),
  createCustomer: (data: CustomerInput) => post<Customer>('/customers', data),
  updateCustomer: (id: string, data: CustomerInput) => put<Customer>(`/customers/${id}`, data),
  deleteCustomer: (id: string) => del(`/customers/${id}`),
  uploadDocument: (id: string, file: File, label: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('label', label);
    return request<CustomerDocument>(`/customers/${id}/documents`, { method: 'POST', body: fd });
  },
  deleteDocument: (id: string, docId: string) => del(`/customers/${id}/documents/${docId}`),

  // Loans
  listLoans: () => get<LoanListItem[]>('/loans'),
  getLoan: (id: string) => get<LoanDetail>(`/loans/${id}`),
  previewSchedule: (data: Omit<LoanInput, 'customerId' | 'disbursementDate' | 'graceDaysOverride' | 'defaultThresholdDaysOverride'>) =>
    post<ScheduleSummary>('/loans/preview', data),
  createLoan: (data: LoanInput) => post<Loan>('/loans', data),
  updateLoan: (id: string, data: LoanInput) => put<Loan>(`/loans/${id}`, data),
  deleteLoan: (id: string) => del(`/loans/${id}`),
  markLoanDefaulted: (id: string) => post<Loan>(`/loans/${id}/default`),

  // Payments
  listPayments: (params?: { loanId?: string; customerId?: string }) => {
    const q = new URLSearchParams();
    if (params?.loanId) q.set('loanId', params.loanId);
    if (params?.customerId) q.set('customerId', params.customerId);
    const qs = q.toString();
    return get<PaymentListItem[]>(`/payments${qs ? `?${qs}` : ''}`);
  },
  createPayment: (data: PaymentInput) => post<Payment>('/payments', data),

  // Actions / collections
  getTodayCollection: (includeOverdue = true) =>
    get<TodayCollectionResponse>(`/collections/today?includeOverdue=${includeOverdue}`),
  getActionRequired: () => get<ActionRequiredResponse>('/action-required'),
  capitalizeInstallment: (installmentId: string) =>
    post<CapitalizeResult>(`/installments/${installmentId}/default`),
};
