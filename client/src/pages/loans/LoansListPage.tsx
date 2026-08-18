import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge, LoanStatusBadge } from '../../components/ui/Badge';
import { Input, Select } from '../../components/ui/Field';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Feedback';
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui/Table';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { FREQUENCY_LABEL, formatCurrency, formatDate } from '../../lib/format';
import type { LoanStatus } from '../../lib/types';

export function LoansListPage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => api.listLoans(), []);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<LoanStatus | 'ALL'>('ALL');

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.filter((l) => {
      if (status !== 'ALL' && l.status !== status) return false;
      if (!q) return true;
      return (
        l.customer.name.toLowerCase().includes(q) ||
        l.customer.customerNumber.toLowerCase().includes(q)
      );
    });
  }, [data, query, status]);

  return (
    <>
      <PageHeader
        title="Loans"
        subtitle="All loans with outstanding balance and next due date."
        actions={
          <Link to="/loans/new">
            <Button>+ New Loan</Button>
          </Link>
        }
      />

      <Card>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <Input
            placeholder="Search by customer…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-xs"
          />
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as LoanStatus | 'ALL')}
            className="max-w-[10rem]"
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="CLOSED">Closed</option>
            <option value="DEFAULTED">Defaulted</option>
          </Select>
        </div>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No loans found"
            action={
              <Link to="/loans/new">
                <Button>+ New Loan</Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Customer</TH>
                <TH>Type</TH>
                <TH align="right">Principal</TH>
                <TH align="right">Outstanding</TH>
                <TH>Next Due</TH>
                <TH align="center">Status</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((l) => (
                <TR key={l.id} onClick={() => navigate(`/loans/${l.id}`)}>
                  <TD>
                    <div className="font-medium text-slate-800">{l.customer.name}</div>
                    <div className="text-xs text-slate-400">{l.customer.customerNumber}</div>
                  </TD>
                  <TD>
                    <div>{FREQUENCY_LABEL[l.frequency]}</div>
                    <div className="text-xs text-slate-400">
                      {l.interestMethod} · {l.annualRatePct}%
                    </div>
                  </TD>
                  <TD align="right">{formatCurrency(l.principal)}</TD>
                  <TD align="right">{formatCurrency(l.rollup.outstanding)}</TD>
                  <TD>{formatDate(l.rollup.nextDueDate)}</TD>
                  <TD align="center">
                    <div className="flex items-center justify-center gap-1">
                      <LoanStatusBadge status={l.status} />
                      {(l.rollup.actionRequiredCount > 0 || l.rollup.loanDefaultEligible) && (
                        <Badge tone="red">!</Badge>
                      )}
                    </div>
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
