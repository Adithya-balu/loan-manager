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
import { formatCompactCurrency, formatCurrency } from '../lib/format';
import { useI18n } from '../i18n/I18nContext';
import type { LoanFrequency } from '../lib/types';

const FREQ_COLORS: Record<LoanFrequency, string> = {
  DAILY: '#6366f1',
  WEEKLY: '#0ea5e9',
  MONTHLY: '#10b981',
};

export function DashboardPage() {
  const { data, loading, error, reload } = useApi(() => api.getDashboard(), []);
  const { lang, t } = useI18n();

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? t('common.noData')} onRetry={reload} />;

  const { kpis, collections, portfolio, trend, actionRequiredCount, topRisk } = data;

  const portfolioData = (Object.keys(portfolio) as LoanFrequency[]).map((f) => ({
    frequency: f,
    label: t(`freq.${f}`),
    outstanding: portfolio[f].outstanding,
    count: portfolio[f].count,
  }));

  const trendData = trend.map((t) => ({
    ...t,
    label: new Date(`${t.month}-01T00:00:00Z`).toLocaleDateString(lang === 'ta' ? 'ta-IN' : 'en-IN', {
      month: 'short',
      timeZone: 'UTC',
    }),
  }));

  return (
    <>
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        actions={
          <Link to="/loans/new">
            <Button>{t('common.newLoan')}</Button>
          </Link>
        }
      />

      {actionRequiredCount > 0 && (
        <Link to="/action-required" className="mb-6 block">
          <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 dark:border-rose-900 dark:bg-rose-950/40">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500 text-sm font-bold text-white">
                {actionRequiredCount}
              </span>
              <div>
                <p className="text-sm font-semibold text-rose-800 dark:text-rose-300">{t('dashboard.actionRequired')}</p>
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  {t('dashboard.actionRequiredHint')}
                </p>
              </div>
            </div>
            <span className="text-sm font-medium text-rose-700 dark:text-rose-400">{t('dashboard.review')}</span>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('dashboard.totalDisbursed')} value={formatCurrency(kpis.totalDisbursed)} />
        <StatCard label={t('dashboard.outstanding')} value={formatCurrency(kpis.outstanding)} />
        <StatCard
          label={t('dashboard.interestEarned')}
          value={formatCurrency(kpis.interestEarned)}
          tone="positive"
        />
        <StatCard
          label={t('dashboard.overdue')}
          value={formatCurrency(kpis.overdueAmount)}
          tone={kpis.overdueAmount > 0 ? 'danger' : 'default'}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('dashboard.activeLoans')} value={kpis.activeLoans} />
        <StatCard label={t('dashboard.closedLoans')} value={kpis.closedLoans} />
        <StatCard
          label={t('dashboard.defaultedLoans')}
          value={kpis.defaultedLoans}
          tone={kpis.defaultedLoans > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label={t('dashboard.collectionEfficiency')}
          value={`${kpis.collectionEfficiency}%`}
          tone={kpis.collectionEfficiency >= 90 ? 'positive' : 'warning'}
        />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <StatCard label={t('dashboard.collectedToday')} value={formatCurrency(collections.today)} />
        <StatCard label={t('dashboard.collectedWeek')} value={formatCurrency(collections.week)} />
        <StatCard label={t('dashboard.collectedMonth')} value={formatCurrency(collections.month)} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t('dashboard.revenue')} subtitle={t('dashboard.revenueSubtitle')} />
          <CardBody>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="var(--chart-axis)" />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    stroke="var(--chart-axis)"
                    tickFormatter={(v) => formatCompactCurrency(v as number)}
                    width={70}
                  />
                  <Tooltip formatter={(v) => formatCurrency(v as number)} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name={t('dashboard.revenueSeries')}
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
          <CardHeader title={t('dashboard.portfolioByType')} subtitle={t('dashboard.portfolioByTypeSubtitle')} />
          <CardBody>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={portfolioData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="var(--chart-axis)" />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    stroke="var(--chart-axis)"
                    tickFormatter={(v) => formatCompactCurrency(v as number)}
                    width={70}
                  />
                  <Tooltip formatter={(v) => formatCurrency(v as number)} />
                  <Bar dataKey="outstanding" name={t('dashboard.outstanding')} radius={[4, 4, 0, 0]}>
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
            title={t('dashboard.highestRisk')}
            subtitle={t('dashboard.highestRiskSubtitle')}
            action={
              <Link to="/customers" className="text-xs font-medium text-indigo-600">
                {t('common.viewAll')}
              </Link>
            }
          />
          <CardBody className="space-y-2">
            {topRisk.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">
                {t('dashboard.noHistory')}
              </p>
            )}
            {topRisk.map((c) => (
              <Link
                key={c.id}
                to={`/customers/${c.id}`}
                className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{c.name}</p>
                  <p className="text-xs text-slate-400">{c.customerNumber}</p>
                </div>
                <RiskBadge risk={c.risk} />
              </Link>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('dashboard.portfolioMix')} subtitle={t('dashboard.portfolioMixSubtitle')} />
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
                  {t('dashboard.loansCount', { count: d.count })} · {formatCurrency(d.outstanding)}
                </span>
              </div>
            ))}
            <div className="border-t border-slate-100 pt-3 text-sm text-slate-500 dark:border-slate-700">
              {t('dashboard.customersTotal', { count: kpis.totalCustomers })}
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
