import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader } from '../components/PageHeader';
import { Card, CardBody, CardHeader, StatCard } from '../components/ui/Card';
import { RiskBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ErrorState, LoadingState } from '../components/ui/Feedback';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { formatCompactCurrency, formatCurrency, FREQUENCY_LABEL } from '../lib/format';
import type { LoanFrequency } from '../lib/types';

const FREQ_COLORS: Record<LoanFrequency, string> = {
  DAILY: '#6366f1',
  WEEKLY: '#0ea5e9',
  MONTHLY: '#10b981',
};

export function DashboardPage() {
  const { data, loading, error, reload } = useApi(() => api.getDashboard(), []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? 'No data'} onRetry={reload} />;

  const { kpis, collections, portfolio, trend, actionRequiredCount, topRisk } = data;

  const portfolioData = (Object.keys(portfolio) as LoanFrequency[]).map((f) => ({
    frequency: f,
    label: FREQUENCY_LABEL[f],
    outstanding: portfolio[f].outstanding,
    count: portfolio[f].count,
  }));

  const trendData = trend.map((t) => ({
    ...t,
    label: new Date(`${t.month}-01T00:00:00Z`).toLocaleDateString('en-IN', {
      month: 'short',
      timeZone: 'UTC',
    }),
  }));

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Portfolio health and collection performance at a glance."
        actions={
          <Link to="/loans/new">
            <Button>+ New Loan</Button>
          </Link>
        }
      />

      {actionRequiredCount > 0 && (
        <Link to="/action-required" className="mb-6 block">
          <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-5 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500 text-sm font-bold text-white">
                {actionRequiredCount}
              </span>
              <div>
                <p className="text-sm font-semibold text-rose-800">Action required</p>
                <p className="text-xs text-rose-600">
                  Overdue installments past grace and loans eligible to be defaulted.
                </p>
              </div>
            </div>
            <span className="text-sm font-medium text-rose-700">Review →</span>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Disbursed" value={formatCurrency(kpis.totalDisbursed)} />
        <StatCard label="Outstanding" value={formatCurrency(kpis.outstanding)} />
        <StatCard
          label="Interest Earned"
          value={formatCurrency(kpis.interestEarned)}
          tone="positive"
        />
        <StatCard
          label="Overdue"
          value={formatCurrency(kpis.overdueAmount)}
          tone={kpis.overdueAmount > 0 ? 'danger' : 'default'}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active Loans" value={kpis.activeLoans} />
        <StatCard label="Closed Loans" value={kpis.closedLoans} />
        <StatCard
          label="Defaulted Loans"
          value={kpis.defaultedLoans}
          tone={kpis.defaultedLoans > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label="Collection Efficiency"
          value={`${kpis.collectionEfficiency}%`}
          tone={kpis.collectionEfficiency >= 90 ? 'positive' : 'warning'}
        />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <StatCard label="Collected Today" value={formatCurrency(collections.today)} />
        <StatCard label="Collected This Week" value={formatCurrency(collections.week)} />
        <StatCard label="Collected This Month" value={formatCurrency(collections.month)} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Disbursed vs Collected" subtitle="Last 6 months" />
          <CardBody>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    stroke="#94a3b8"
                    tickFormatter={(v) => formatCompactCurrency(v as number)}
                    width={70}
                  />
                  <Tooltip formatter={(v) => formatCurrency(v as number)} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="disbursed"
                    name="Disbursed"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="collected"
                    name="Collected"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Portfolio by Type" subtitle="Outstanding balance" />
          <CardBody>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={portfolioData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    stroke="#94a3b8"
                    tickFormatter={(v) => formatCompactCurrency(v as number)}
                    width={70}
                  />
                  <Tooltip formatter={(v) => formatCurrency(v as number)} />
                  <Bar dataKey="outstanding" name="Outstanding" radius={[4, 4, 0, 0]}>
                    {portfolioData.map((d) => (
                      <Cell key={d.frequency} fill={FREQ_COLORS[d.frequency]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Highest-risk Customers"
            subtitle="Lowest repayment reliability"
            action={
              <Link to="/customers" className="text-xs font-medium text-indigo-600">
                View all
              </Link>
            }
          />
          <CardBody className="space-y-2">
            {topRisk.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">
                No repayment history yet.
              </p>
            )}
            {topRisk.map((c) => (
              <Link
                key={c.id}
                to={`/customers/${c.id}`}
                className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">{c.name}</p>
                  <p className="text-xs text-slate-400">{c.customerNumber}</p>
                </div>
                <RiskBadge risk={c.risk} />
              </Link>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Portfolio Mix" subtitle="Loans by repayment frequency" />
          <CardBody className="space-y-3">
            {portfolioData.map((d) => (
              <div key={d.frequency} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: FREQ_COLORS[d.frequency] }}
                  />
                  {d.label}
                </span>
                <span className="text-slate-500">
                  {d.count} loans · {formatCurrency(d.outstanding)}
                </span>
              </div>
            ))}
            <div className="border-t border-slate-100 pt-3 text-sm text-slate-500">
              {kpis.totalCustomers} customers total
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
