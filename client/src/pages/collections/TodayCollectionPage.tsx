import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Card, StatCard } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Feedback';
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui/Table';
import { PaymentModal, type PaymentPrefill } from '../../components/PaymentModal';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { FREQUENCY_LABEL, formatCurrency, formatDate } from '../../lib/format';
import type { CollectionItem } from '../../lib/types';

export function TodayCollectionPage() {
  const navigate = useNavigate();
  const [includeOverdue, setIncludeOverdue] = useState(true);
  const { data, loading, error, reload } = useApi(
    () => api.getTodayCollection(includeOverdue),
    [includeOverdue],
  );

  const [payOpen, setPayOpen] = useState(false);
  const [activeLoanId, setActiveLoanId] = useState('');
  const [prefill, setPrefill] = useState<PaymentPrefill | undefined>(undefined);

  function collect(item: CollectionItem) {
    setActiveLoanId(item.loanId);
    setPrefill({ installmentId: item.installmentId, amount: item.remaining, sequence: item.sequence });
    setPayOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Today's Collection"
        subtitle={data ? `Collection sheet for ${formatDate(data.date)}` : 'Loading…'}
        actions={
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={includeOverdue}
              onChange={(e) => setIncludeOverdue(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Include overdue carry-overs
          </label>
        }
      />

      {loading ? (
        <LoadingState />
      ) : error || !data ? (
        <ErrorState message={error ?? 'No data'} onRetry={reload} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Due Today" value={formatCurrency(data.totals.dueToday)} />
            <StatCard
              label="Overdue"
              value={formatCurrency(data.totals.overdue)}
              tone={data.totals.overdue > 0 ? 'danger' : 'default'}
            />
            <StatCard label="Items to Collect" value={data.totals.count} />
          </div>

          <Card className="mt-6">
            {data.items.length === 0 ? (
              <EmptyState
                title="Nothing to collect"
                description="No installments are due or overdue for this view."
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Customer</TH>
                    <TH>Type</TH>
                    <TH align="center">Inst.</TH>
                    <TH>Due Date</TH>
                    <TH align="right">Remaining</TH>
                    <TH align="center">Status</TH>
                    <TH align="right">Action</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.items.map((item) => (
                    <TR key={item.installmentId}>
                      <TD>
                        <button
                          className="text-left"
                          onClick={() => navigate(`/customers/${item.customerId}`)}
                        >
                          <div className="font-medium text-slate-800 hover:text-indigo-600">
                            {item.customerName}
                          </div>
                          <div className="text-xs text-slate-400">{item.customerNumber}</div>
                        </button>
                      </TD>
                      <TD>{FREQUENCY_LABEL[item.frequency]}</TD>
                      <TD align="center">#{item.sequence}</TD>
                      <TD>
                        {formatDate(item.dueDate)}
                        {item.daysPastDue > 0 && (
                          <span className="ml-1 text-xs text-rose-500">({item.daysPastDue}d late)</span>
                        )}
                      </TD>
                      <TD align="right">{formatCurrency(item.remaining)}</TD>
                      <TD align="center">
                        <div className="flex items-center justify-center gap-1">
                          <StatusBadge status={item.status} />
                          {item.actionRequired && <Badge tone="red">!</Badge>}
                        </div>
                      </TD>
                      <TD align="right">
                        <Button size="sm" onClick={() => collect(item)}>
                          Collect
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </>
      )}

      {activeLoanId && (
        <PaymentModal
          open={payOpen}
          onClose={() => setPayOpen(false)}
          loanId={activeLoanId}
          prefill={prefill}
          title="Collect Repayment"
          onSuccess={reload}
        />
      )}
    </>
  );
}
