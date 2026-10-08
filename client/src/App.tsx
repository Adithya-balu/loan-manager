import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/auth/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CustomersListPage } from './pages/customers/CustomersListPage';
import { CustomerFormPage } from './pages/customers/CustomerFormPage';
import { CustomerDetailPage } from './pages/customers/CustomerDetailPage';
import { LoansListPage } from './pages/loans/LoansListPage';
import { LoanFormPage } from './pages/loans/LoanFormPage';
import { LoanDetailPage } from './pages/loans/LoanDetailPage';
import { PaymentsListPage } from './pages/payments/PaymentsListPage';
import { PaymentFormPage } from './pages/payments/PaymentFormPage';
import { TodayCollectionPage } from './pages/collections/TodayCollectionPage';
import { ActionRequiredPage } from './pages/actions/ActionRequiredPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { CompanyProfilePage } from './pages/company/CompanyProfilePage';
import { AccountPage } from './pages/account/AccountPage';

export default function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="customers" element={<CustomersListPage />} />
          <Route path="customers/new" element={<CustomerFormPage />} />
          <Route path="customers/:id" element={<CustomerDetailPage />} />
          <Route path="customers/:id/edit" element={<CustomerFormPage />} />
          <Route path="loans" element={<LoansListPage />} />
          <Route path="loans/new" element={<LoanFormPage />} />
          <Route path="loans/:id" element={<LoanDetailPage />} />
          <Route path="loans/:id/edit" element={<LoanFormPage />} />
          <Route path="repayments" element={<PaymentsListPage />} />
          <Route path="repayments/new" element={<PaymentFormPage />} />
          <Route path="collections/today" element={<TodayCollectionPage />} />
          <Route path="action-required" element={<ActionRequiredPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route element={<ProtectedRoute roles={['ADMIN']} />}>
            <Route path="settings" element={<SettingsPage />} />
            <Route path="company" element={<CompanyProfilePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

