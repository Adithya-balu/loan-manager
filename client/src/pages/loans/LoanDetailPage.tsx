import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Card, CardHeader, StatCard } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoanStatusBadge, StatusBadge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Feedback';
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';
import { PaymentModal, type PaymentPrefill } from '../../components/PaymentModal';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { FREQUENCY_LABEL, formatCurrency, formatDate } from '../../lib/format';
import type { EnrichedInstallment } from '../../lib/types';

export function LoanDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.getLoan(id), [id]);

  const [payOpen, setPayOpen] = useState(false);
  const [payPrefill, setPayPrefill] = useState<PaymentPrefill | undefined>(undefined);
  const [capTarget, setCapTarget] = useState<EnrichedInstallment | null>(null);
  const [capBusy, setCapBusy] = useState(false);
  const [defaultLoanOpen, setDefaultLoanOpen] = useState(false);
  const [defaultBusy, setDefaultBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? 'Not found'} onRetry={reload} />;

  const { rollup } = data;
  const hasPayments = data.payments.length > 0;

  function openPayment(prefill?: PaymentPrefill) {
    setPayPrefill(prefill);
    setPayOpen(true);
  }

  async function confirmCapitalize() {
    if (!capTarget) return;
    setCapBusy(true);
    try {
      const res = await api.capitalizeInstallment(capTarget.id);
      toast.success(
        res.loanDefaulted
          ? 'Installment capitalized. Loan marked as defaulted.'
          : `Capitalized ${formatCurrency(res.capitalized)} into principal; ${res.reamortized} installments re-amortized.`,
      );
      setCapTarget(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setCapBusy(false);
    }
  }

  async function confirmDefaultLoan() {
    setDefaultBusy(true);
    try {
      await api.markLoanDefaulted(id);
      toast.success('Loan marked as defaulted');
      setDefaultLoanOpen(false);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setDefaultBusy(false);
    }
  }

  async function confirmDelete() {
    try {
      await api.deleteLoan(id);
      toast.success('Loan deleted');
      navigate('/loans');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
      setDeleteOpen(false);
    }
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {FREQUENCY_LABEL[data.frequency]} Loan
            <LoanStatusBadge status={data.status} />
          </span>
        }
        subtitle={
          <Link to={`/customers/${data.customerId}`} className="text-indigo-600 hover:underline">
            {data.customer.name} · {data.customer.customerNumber}
          </Link>
        }
        actions={
          <>
            {data.status === 'ACTIVE' && (
              <Button onClick={() => openPayment(undefined)}>+ Record Payment</Button>
            )}
            {rollup.loanDefaultEligible && (
              <Button variant="danger" onClick={() => setDefaultLoanOpen(true)}>
                Mark Loan Defaulted
              </Button>
            )}
            {!hasPayments && (
              <Link to={`/loans/${id}/edit`}>
                <Button variant="secondary">Edit</Button>
              </Link>
            )}
            <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          </>
        }
      />

      {rollup.loanDefaultEligible && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          No payment for {rollup.lastPaymentDate ? `since ${formatDate(rollup.lastPaymentDate)}` : 'a while'}
          . This loan has crossed its default threshold and can be marked defaulted.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Principal" value={formatCurrency(data.principal)} hint={`${data.annualRatePct}% · ${data.interestMethod}`} />
        <StatCard label="Outstanding" value={formatCurrency(rollup.outstanding)} />
        <StatCard label="Collected" value={formatCurrency(rollup.totalPaid)} tone="positive" />
        <StatCard
          label="Overdue"
          value={formatCurrency(rollup.overdueAmount)}
          tone={rollup.overdueAmount > 0 ? 'danger' : 'default'}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Payable" value={formatCurrency(rollup.totalPayable)} />
        <StatCard label="Total Interest" value={formatCurrency(rollup.totalInterest)} />
        <StatCard
          label="Installments Paid"
          value={`${rollup.paidInstallments} / ${data.installments}`}
        />
        <StatCard label="Next Due" value={formatDate(rollup.nextDueDate)} hint={`Grace: ${data.effectiveGraceDays} days`} />
      </div>

      <Card className="mt-6">
        <CardHeader title="Repayment Schedule" subtitle={`${data.schedule.length} installments`} />
        <Table>
          <THead>
            <TR>
              <TH>#</TH>
              <TH>Due Date</TH>
              <TH align="right">Amount</TH>
              <TH align="right">Paid</TH>
              <TH align="right">Remaining</TH>
              <TH align="center">Status</TH>
              <TH align="center">Late</TH>
              <TH align="right">Action</TH>
            </TR>
          </THead>
          <TBody>
            {data.schedule.map((inst) => (
              <TR key={inst.id}>
                <TD>{inst.sequence}</TD>
                <TD>{formatDate(inst.dueDate)}</TD>
                <TD align="right">{formatCurrency(inst.amountDue)}</TD>
                <TD align="right">{formatCurrency(inst.paidAmount)}</TD>
                <TD align="right">{formatCurrency(inst.remaining)}</TD>
                <TD align="center">
                  <StatusBadge status={inst.derivedStatus} />
                </TD>
                <TD align="center">
                  {inst.daysPastDue > 0 ? (
                    <span className={inst.actionRequired ? 'font-medium text-rose-600' : 'text-slate-500'}>
                      {inst.daysPastDue}d
                    </span>
                  ) : (
                    '—'
                  )}
                </TD>
                <TD align="right">
                  <div className="flex items-center justify-end gap-1">
                    {data.status === 'ACTIVE' &&
                      inst.derivedStatus !== 'PAID' &&
                      inst.derivedStatus !== 'DEFAULTED' &&
                      inst.remaining > 0 && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            openPayment({
                              installmentId: inst.id,
                              amount: inst.remaining,
                              sequence: inst.sequence,
                            })
                          }
                        >
                          Collect
                        </Button>
                      )}
                    {inst.actionRequired && (
                      <Button size="sm" variant="danger" onClick={() => setCapTarget(inst)}>
                        {inst.paidAmount > 0 ? 'Capitalize' : 'Default'}
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Payments" subtitle={`${data.payments.length} recorded`} />
        {data.payments.length === 0 ? (
          <EmptyState title="No payments recorded yet" />
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
              {data.payments.map((p) => (
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

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        loanId={id}
        prefill={payPrefill}
        subtitle={`${data.customer.name} · outstanding ${formatCurrency(rollup.outstanding)}`}
        onSuccess={reload}
      />

      <ConfirmDialog
        open={capTarget !== null}
        title={capTarget?.paidAmount ? 'Capitalize shortfall?' : 'Mark installment defaulted?'}
        danger
        busy={capBusy}
        confirmLabel={capTarget?.paidAmount ? 'Capitalize' : 'Default'}
        message={
          capTarget ? (
            <>
              The unpaid amount of{' '}
              <strong>{formatCurrency(capTarget.remaining)}</strong> on installment #
              {capTarget.sequence} will be added to the outstanding principal, and the remaining
              installments will be re-amortized (interest recomputed). This cannot be undone.
            </>
          ) : (
            ''
          )
        }
        onConfirm={confirmCapitalize}
        onCancel={() => setCapTarget(null)}
      />

      <ConfirmDialog
        open={defaultLoanOpen}
        title="Mark loan as defaulted?"
        danger
        busy={defaultBusy}
        confirmLabel="Mark Defaulted"
        message="This closes the loan as defaulted. Outstanding installments will no longer be collectible through the normal flow."
        onConfirm={confirmDefaultLoan}
        onCancel={() => setDefaultLoanOpen(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete loan?"
        danger
        confirmLabel="Delete"
        message="This permanently removes the loan, its schedule and payments. This cannot be undone."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}
