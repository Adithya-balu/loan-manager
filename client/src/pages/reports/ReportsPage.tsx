import { useMemo, useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Card, CardBody, CardHeader, StatCard } from '../../components/ui/Card';
import { Field, Input, Select } from '../../components/ui/Field';
import { LoanStatusBadge, StatusBadge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui/Table';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { FREQUENCY_LABEL, formatCurrency, formatDate, todayISO } from '../../lib/format';
import type { LoanDetail } from '../../lib/types';

type Tab = 'collection' | 'outstanding' | 'statement' | 'revenue';

const TABS: { id: Tab; label: string }[] = [
  { id: 'collection', label: 'Collection' },
  { id: 'outstanding', label: 'Outstanding' },
  { id: 'statement', label: 'Customer Statement' },
  { id: 'revenue', label: 'Revenue' },
];

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>('collection');

  return (
    <>
      <PageHeader title="Reports" subtitle="Collection, portfolio, statements and revenue." />

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'collection' && <CollectionReport />}
      {tab === 'outstanding' && <OutstandingReport />}
      {tab === 'statement' && <StatementReport />}
      {tab === 'revenue' && <RevenueReport />}
    </>
  );
}

function CollectionReport() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(todayISO());
  const { data: payments, loading, error, reload } = useApi(() => api.listPayments(), []);

  const filtered = useMemo(() => {
    if (!payments) return [];
    return payments.filter((p) => {
      const d = p.date.slice(0, 10);
      return d >= from && d <= to;
    });
  }, [payments, from, to]);

  const total = filtered.reduce((a, p) => a + p.amount, 0);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <Card className="mb-4">
        <CardBody>
          <div className="flex flex-wrap items-end gap-4">
            <Field label="From">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
        </CardBody>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Payments" value={filtered.length} />
        <StatCard label="Total Collected" value={formatCurrency(total)} tone="positive" />
      </div>

      <Card>
        <CardHeader title="Collection" subtitle={`${formatDate(from)} – ${formatDate(to)}`} />
        {filtered.length === 0 ? (
          <EmptyState title="No payments in this range" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Customer</TH>
                <TH>Loan</TH>
                <TH>Mode</TH>
                <TH align="right">Amount</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((p) => (
                <TR key={p.id}>
                  <TD>{formatDate(p.date)}</TD>
                  <TD>
                    {p.customer.name}
                    <span className="text-slate-400"> · {p.customer.customerNumber}</span>
                  </TD>
                  <TD>{FREQUENCY_LABEL[p.loan.frequency]}</TD>
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

function OutstandingReport() {
  const { data: loans, loading, error, reload } = useApi(() => api.listLoans(), []);

  if (loading) return <LoadingState />;
  if (error || !loans) return <ErrorState message={error ?? 'No data'} onRetry={reload} />;

  const active = loans.filter((l) => l.status !== 'CLOSED');
  const totalOutstanding = active.reduce((a, l) => a + l.rollup.outstanding, 0);
  const totalOverdue = active.reduce((a, l) => a + l.rollup.overdueAmount, 0);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Open Loans" value={active.length} />
        <StatCard label="Outstanding" value={formatCurrency(totalOutstanding)} />
        <StatCard
          label="Overdue"
          value={formatCurrency(totalOverdue)}
          tone={totalOverdue > 0 ? 'danger' : 'default'}
        />
      </div>

      <Card>
        <CardHeader title="Outstanding Portfolio" subtitle={`${active.length} open loans`} />
        {active.length === 0 ? (
          <EmptyState title="No open loans" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Customer</TH>
                <TH>Type</TH>
                <TH align="right">Principal</TH>
                <TH align="right">Outstanding</TH>
                <TH align="right">Overdue</TH>
                <TH align="center">Status</TH>
              </TR>
            </THead>
            <TBody>
              {active.map((l) => (
                <TR key={l.id}>
                  <TD>
                    {l.customer.name}
                    <span className="text-slate-400"> · {l.customer.customerNumber}</span>
                  </TD>
                  <TD>
                    {FREQUENCY_LABEL[l.frequency]} · {l.interestMethod}
                  </TD>
                  <TD align="right">{formatCurrency(l.principal)}</TD>
                  <TD align="right">{formatCurrency(l.rollup.outstanding)}</TD>
                  <TD align="right">{formatCurrency(l.rollup.overdueAmount)}</TD>
                  <TD align="center">
                    <LoanStatusBadge status={l.status} />
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

function StatementReport() {
  const { data: loans } = useApi(() => api.listLoans(), []);
  const [loanId, setLoanId] = useState('');
  const [detail, setDetail] = useState<LoanDetail | null>(null);
  const [loading, setLoading] = useState(false);

  function onSelect(id: string) {
    setLoanId(id);
    setDetail(null);
    if (!id) return;
    setLoading(true);
    api
      .getLoan(id)
      .then(setDetail)
      .finally(() => setLoading(false));
  }

  return (
    <>
      <Card className="mb-4">
        <CardBody>
          <Field label="Loan">
            <Select value={loanId} onChange={(e) => onSelect(e.target.value)}>
              <option value="">Select a loan…</option>
              {loans?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.customer.name} ({l.customer.customerNumber}) · {FREQUENCY_LABEL[l.frequency]} ·{' '}
                  {formatCurrency(l.principal)}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      {loading && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}

      {detail && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Principal" value={formatCurrency(detail.principal)} />
            <StatCard label="Outstanding" value={formatCurrency(detail.rollup.outstanding)} />
            <StatCard
              label="Collected"
              value={formatCurrency(detail.rollup.totalPaid)}
              tone="positive"
            />
            <StatCard label="Total Payable" value={formatCurrency(detail.rollup.totalPayable)} />
          </div>

          <Card className="mb-4">
            <CardHeader
              title="Schedule"
              subtitle={`${detail.customer.name} · ${detail.customer.customerNumber}`}
            />
            <Table>
              <THead>
                <TR>
                  <TH>#</TH>
                  <TH>Due Date</TH>
                  <TH align="right">Amount</TH>
                  <TH align="right">Paid</TH>
                  <TH align="right">Remaining</TH>
                  <TH align="center">Status</TH>
                </TR>
              </THead>
              <TBody>
                {detail.schedule.map((i) => (
                  <TR key={i.id}>
                    <TD>{i.sequence}</TD>
                    <TD>{formatDate(i.dueDate)}</TD>
                    <TD align="right">{formatCurrency(i.amountDue)}</TD>
                    <TD align="right">{formatCurrency(i.paidAmount)}</TD>
                    <TD align="right">{formatCurrency(i.remaining)}</TD>
                    <TD align="center">
                      <StatusBadge status={i.derivedStatus} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Payment Ledger" subtitle={`${detail.payments.length} payments`} />
            {detail.payments.length === 0 ? (
              <EmptyState title="No payments recorded" />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH align="center">Installment</TH>
                    <TH>Mode</TH>
                    <TH>Note</TH>
                    <TH align="right">Amount</TH>
                  </TR>
                </THead>
                <TBody>
                  {detail.payments.map((p) => (
                    <TR key={p.id}>
                      <TD>{formatDate(p.date)}</TD>
                      <TD align="center">{p.installment ? `#${p.installment.sequence}` : '—'}</TD>
                      <TD>{p.mode}</TD>
                      <TD>{p.note ?? '—'}</TD>
                      <TD align="right">{formatCurrency(p.amount)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </>
      )}
    </>
  );
}

function RevenueReport() {
  const { data, loading, error, reload } = useApi(() => api.getDashboard(), []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? 'No data'} onRetry={reload} />;

  const rows = data.trend.map((t) => ({
    ...t,
    label: new Date(`${t.month}-01T00:00:00Z`).toLocaleDateString('en-IN', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }),
  }));
  const total = rows.reduce((a, r) => a + r.revenue, 0);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Interest Earned (all time)" value={formatCurrency(data.kpis.interestEarned)} tone="positive" />
        <StatCard label="Revenue (last 6 months)" value={formatCurrency(total)} />
      </div>

      <Card>
        <CardHeader title="Monthly Revenue" subtitle="Interest earned per month" />
        <Table>
          <THead>
            <TR>
              <TH>Month</TH>
              <TH align="right">Collected</TH>
              <TH align="right">Revenue (interest)</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.month}>
                <TD>{r.label}</TD>
                <TD align="right">{formatCurrency(r.collected)}</TD>
                <TD align="right">{formatCurrency(r.revenue)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
