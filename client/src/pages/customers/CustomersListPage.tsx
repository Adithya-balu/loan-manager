import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { RiskBadge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Field';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Feedback';
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui/Table';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { formatCurrency } from '../../lib/format';

export function CustomersListPage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => api.listCustomers(), []);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.customerNumber.toLowerCase().includes(q) ||
        c.mobile.toLowerCase().includes(q),
    );
  }, [data, query]);

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="All borrowers with live risk and outstanding balances."
        actions={
          <Link to="/customers/new">
            <Button>+ New Customer</Button>
          </Link>
        }
      />

      <Card>
        <div className="border-b border-slate-100 p-3">
          <Input
            placeholder="Search by name, number or mobile…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-sm"
          />
        </div>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No customers found"
            description="Create your first customer to start issuing loans."
            action={
              <Link to="/customers/new">
                <Button>+ New Customer</Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Customer</TH>
                <TH>Mobile</TH>
                <TH align="center">Active Loans</TH>
                <TH align="right">Outstanding</TH>
                <TH align="center">Docs</TH>
                <TH align="center">Risk</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((c) => (
                <TR key={c.id} onClick={() => navigate(`/customers/${c.id}`)}>
                  <TD>
                    <div className="font-medium text-slate-800">{c.name}</div>
                    <div className="text-xs text-slate-400">{c.customerNumber}</div>
                  </TD>
                  <TD>{c.mobile}</TD>
                  <TD align="center">
                    {c.activeLoans}
                    <span className="text-slate-400"> / {c.loanCount}</span>
                  </TD>
                  <TD align="right">{formatCurrency(c.outstanding)}</TD>
                  <TD align="center">{c.documentCount}</TD>
                  <TD align="center">
                    <RiskBadge risk={c.risk} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
