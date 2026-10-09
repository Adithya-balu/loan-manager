import { upload } from '@vercel/blob/client';
import type {
  ActionRequiredResponse,
  AppConfig,
  AuthUser,
  CapitalizeResult,
  CompanyInput,
  CompanyProfile,
  Customer,
  CustomerDetail,
  CustomerDocument,
  CustomerInput,
  CustomerListItem,
  DashboardResponse,
  Loan,
  LoanDetail,
  LoanDocument,
  LoanInput,
  LoanListItem,
  Payment,
  PaymentInput,
  PaymentListItem,
  PaymentMode,
  ScheduleSummary,
  SettlementQuote,
  SettlementResult,
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
    // A 401 elsewhere means the session expired. Login/me report it themselves, and
    // change-password's "wrong current password" must not log the user out.
    const sessionCheckExempt = ['/auth/login', '/auth/me', '/auth/change-password'];
    if (res.status === 401 && !sessionCheckExempt.includes(path)) {
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
  changePassword: (currentPassword: string, newPassword: string) =>
    post<{ ok: true }>('/auth/change-password', { currentPassword, newPassword }),

  // Config
  getConfig: () => get<AppConfig>('/config'),
  updateConfig: (loanTypes: AppConfig['loanTypes']) => put<{ ok: true }>('/config', { loanTypes }),

  // Company profile
  getCompany: () => get<CompanyProfile>('/company'),
  updateCompany: (data: CompanyInput) => put<CompanyProfile>('/company', data),
  uploadCompanyLogo: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<CompanyProfile>('/company/logo', { method: 'POST', body: fd });
  },

  // Dashboard
  getDashboard: () => get<DashboardResponse>('/dashboard'),

  // Customers
  listCustomers: () => get<CustomerListItem[]>('/customers'),
  getCustomer: (id: string) => get<CustomerDetail>(`/customers/${id}`),
  createCustomer: (data: CustomerInput) => post<Customer>('/customers', data),
  updateCustomer: (id: string, data: CustomerInput) => put<Customer>(`/customers/${id}`, data),
  deleteCustomer: (id: string) => del(`/customers/${id}`),
  uploadDocument: async (id: string, file: File, label: string) => {
    // Uploads go straight from the browser to Vercel Blob (private access) —
    // Vercel Functions cap request bodies at 4.5MB, so routing the file
    // through our API would fail for anything near/above that size.
    const mimeType = file.type || 'application/octet-stream';
    const pathname = `customers/${id}/${Date.now()}-${file.name}`;
    const blob = await upload(pathname, file, {
      access: 'private',
      handleUploadUrl: `${BASE}/customers/${id}/documents/upload-token`,
      contentType: mimeType,
    });
    return post<CustomerDocument>(`/customers/${id}/documents/confirm`, {
      url: blob.url,
      fileName: file.name,
      label,
      mimeType,
    });
  },
  deleteDocument: (id: string, docId: string) => del(`/customers/${id}/documents/${docId}`),
  uploadCustomerPhoto: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<Customer>(`/customers/${id}/photo`, { method: 'POST', body: fd });
  },

  // Loans
  listLoans: () => get<LoanListItem[]>('/loans'),
  getLoan: (id: string) => get<LoanDetail>(`/loans/${id}`),
  previewSchedule: (data: Omit<LoanInput, 'customerId' | 'disbursementDate' | 'graceDaysOverride' | 'defaultThresholdDaysOverride'>) =>
    post<ScheduleSummary>('/loans/preview', data),
  createLoan: (data: LoanInput) => post<Loan>('/loans', data),
  updateLoan: (id: string, data: LoanInput) => put<Loan>(`/loans/${id}`, data),
  deleteLoan: (id: string) => del(`/loans/${id}`),
  markLoanDefaulted: (id: string) => post<Loan>(`/loans/${id}/default`),
  getSettlement: (id: string, date?: string) =>
    get<SettlementQuote>(`/loans/${id}/settlement${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  settleLoan: (id: string, data: { date: string; mode?: PaymentInput['mode'] }) =>
    post<SettlementResult>(`/loans/${id}/settlement`, data),
  uploadLoanDocument: (id: string, file: File, label: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('label', label);
    return request<LoanDocument>(`/loans/${id}/documents`, { method: 'POST', body: fd });
  },
  deleteLoanDocument: (id: string, docId: string) => del(`/loans/${id}/documents/${docId}`),

  // Payments
  listPayments: (params?: { loanId?: string; customerId?: string }) => {
    const q = new URLSearchParams();
    if (params?.loanId) q.set('loanId', params.loanId);
    if (params?.customerId) q.set('customerId', params.customerId);
    const qs = q.toString();
    return get<PaymentListItem[]>(`/payments${qs ? `?${qs}` : ''}`);
  },
  createPayment: (data: PaymentInput) => post<Payment>('/payments', data),
  updatePayment: (
    id: string,
    data: { amount: number; date: string; mode?: PaymentMode; note?: string | null },
  ) => put<Payment>(`/payments/${id}`, data),
  deletePayment: (id: string) => del(`/payments/${id}`),

  // Actions / collections
  getTodayCollection: (includeOverdue = true) =>
    get<TodayCollectionResponse>(`/collections/today?includeOverdue=${includeOverdue}`),
  getActionRequired: () => get<ActionRequiredResponse>('/action-required'),
  capitalizeInstallment: (installmentId: string) =>
    post<CapitalizeResult>(`/installments/${installmentId}/default`),
};
