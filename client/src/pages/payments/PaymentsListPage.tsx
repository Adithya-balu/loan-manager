import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Feedback';
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui/Table';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { FREQUENCY_LABEL, formatCurrency, formatDate } from '../../lib/format';

export function PaymentsListPage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => api.listPayments(), []);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (p) =>
        p.customer.name.toLowerCase().includes(q) ||
        p.customer.customerNumber.toLowerCase().includes(q),
    );
  }, [data, query]);

  const total = useMemo(() => filtered.reduce((a, p) => a + p.amount, 0), [filtered]);

  return (
    <>
      <PageHeader
        title="Repayments"
        subtitle="All collected repayments across every loan."
        actions={
          <Link to="/repayments/new">
            <Button>+ Record Payment</Button>
          </Link>
        }
      />

      <Card>
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 p-3">
          <Input
            placeholder="Search by customer…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-xs"
          />
          <span className="text-sm text-slate-500">
            Total: <strong className="text-slate-700">{formatCurrency(total)}</strong>
          </span>
        </div>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No payments yet"
            action={
              <Link to="/repayments/new">
                <Button>+ Record Payment</Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Customer</TH>
                <TH>Loan</TH>
                <TH align="center">Installment</TH>
                <TH>Mode</TH>
                <TH align="right">Amount</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((p) => (
                <TR key={p.id} onClick={() => navigate(`/loans/${p.loanId}`)}>
                  <TD>{formatDate(p.date)}</TD>
                  <TD>
                    <div className="font-medium text-slate-800">{p.customer.name}</div>
                    <div className="text-xs text-slate-400">{p.customer.customerNumber}</div>
                  </TD>
                  <TD>{FREQUENCY_LABEL[p.loan.frequency]}</TD>
                  <TD align="center">{p.installment ? `#${p.installment.sequence}` : '—'}</TD>
                  <TD>{p.mode}</TD>
                  <TD align="right">{formatCurrency(p.amount)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
