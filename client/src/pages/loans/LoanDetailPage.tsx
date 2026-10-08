import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Card, CardBody, CardHeader, StatCard } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoanStatusBadge, StatusBadge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Feedback';
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';
import { PaymentModal, type PaymentEditTarget, type PaymentPrefill } from '../../components/PaymentModal';
import { SettlementModal } from '../../components/SettlementModal';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { FREQUENCY_LABEL, formatCurrency, formatDate, toDateInput } from '../../lib/format';
import type { EnrichedInstallment, PaymentWithInstallment } from '../../lib/types';

export function LoanDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.getLoan(id), [id]);

  const [payOpen, setPayOpen] = useState(false);
  const [payPrefill, setPayPrefill] = useState<PaymentPrefill | undefined>(undefined);
  const [editingPayment, setEditingPayment] = useState<PaymentEditTarget | undefined>(undefined);
  const [deletePaymentTarget, setDeletePaymentTarget] = useState<PaymentWithInstallment | null>(null);
  const [deletePaymentBusy, setDeletePaymentBusy] = useState(false);
  const [capTarget, setCapTarget] = useState<EnrichedInstallment | null>(null);
  const [capBusy, setCapBusy] = useState(false);
  const [defaultLoanOpen, setDefaultLoanOpen] = useState(false);
  const [defaultBusy, setDefaultBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const docFileRef = useRef<HTMLInputElement>(null);
  const [docLabel, setDocLabel] = useState('');
  const [docUploading, setDocUploading] = useState(false);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? 'Not found'} onRetry={reload} />;

  const { rollup } = data;
  const hasPayments = data.payments.length > 0;

  function openPayment(prefill?: PaymentPrefill) {
    setPayPrefill(prefill);
    setEditingPayment(undefined);
    setPayOpen(true);
  }

  function openEditPayment(payment: PaymentWithInstallment) {
    setPayPrefill(undefined);
    setEditingPayment({
      id: payment.id,
      amount: payment.amount,
      date: toDateInput(payment.date),
      mode: payment.mode,
      note: payment.note,
    });
    setPayOpen(true);
  }

  async function confirmDeletePayment() {
    if (!deletePaymentTarget) return;
    setDeletePaymentBusy(true);
    try {
      await api.deletePayment(deletePaymentTarget.id);
      toast.success('Payment deleted');
      setDeletePaymentTarget(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete payment');
    } finally {
      setDeletePaymentBusy(false);
    }
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

  async function onUploadDoc(file: File) {
    setDocUploading(true);
    try {
      await api.uploadLoanDocument(id, file, docLabel.trim() || file.name);
      toast.success('Document uploaded');
      setDocLabel('');
      if (docFileRef.current) docFileRef.current.value = '';
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setDocUploading(false);
    }
  }

  async function onDeleteDoc(docId: string) {
    try {
      await api.deleteLoanDocument(id, docId);
      toast.success('Document removed');
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
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
            {data.status === 'ACTIVE' && (
              <Button variant="secondary" onClick={() => setSettleOpen(true)}>
                Pre-close / Settle
              </Button>
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
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
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

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Loan Details" />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-400 dark:text-slate-500">Disbursement Mode</dt>
              <dd className="text-slate-700 dark:text-slate-200">{data.disbursementMode}</dd>
              <dt className="text-slate-400 dark:text-slate-500">Disbursed On</dt>
              <dd className="text-slate-700 dark:text-slate-200">{formatDate(data.disbursementDate)}</dd>
              {data.guarantorName && (
                <>
                  <dt className="text-slate-400 dark:text-slate-500">Guarantor</dt>
                  <dd className="text-slate-700 dark:text-slate-200">
                    {data.guarantorName}
                    {data.guarantorRelation ? ` (${data.guarantorRelation})` : ''}
                  </dd>
                </>
              )}
              {data.guarantorMobile && (
                <>
                  <dt className="text-slate-400 dark:text-slate-500">Guarantor Mobile</dt>
                  <dd className="text-slate-700 dark:text-slate-200">{data.guarantorMobile}</dd>
                </>
              )}
              {data.guarantorAddress && (
                <>
                  <dt className="text-slate-400 dark:text-slate-500">Guarantor Address</dt>
                  <dd className="text-slate-700 dark:text-slate-200">{data.guarantorAddress}</dd>
                </>
              )}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Loan Documents" subtitle="Loan-specific files" />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                placeholder="Label (optional)"
                value={docLabel}
                onChange={(e) => setDocLabel(e.target.value)}
              />
              <input
                ref={docFileRef}
                type="file"
                className="text-sm text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 dark:text-slate-300"
                disabled={docUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onUploadDoc(file);
                }}
              />
              {docUploading && <span className="text-xs text-slate-400">Uploading…</span>}
            </div>
            {data.documents.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">No documents uploaded.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {data.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between py-2">
                    <div>
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        {d.label}
                      </a>
                      <p className="text-xs text-slate-400">
                        {d.fileName} · {formatDate(d.uploadedAt)}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => onDeleteDoc(d.id)}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
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
                <TH align="right">Actions</TH>
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
                  <TD align="right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openEditPayment(p)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setDeletePaymentTarget(p)}>
                        Delete
                      </Button>
                    </div>
                  </TD>
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
        editTarget={editingPayment}
        subtitle={`${data.customer.name} · outstanding ${formatCurrency(rollup.outstanding)}`}
        onSuccess={reload}
      />

      <SettlementModal
        open={settleOpen}
        onClose={() => setSettleOpen(false)}
        loanId={id}
        customerName={data.customer.name}
        onSuccess={reload}
      />

      <ConfirmDialog
        open={deletePaymentTarget !== null}
        title="Delete payment?"
        danger
        busy={deletePaymentBusy}
        confirmLabel="Delete"
        message={
          deletePaymentTarget ? (
            <>
              This will remove the payment of{' '}
              <strong>{formatCurrency(deletePaymentTarget.amount)}</strong> dated{' '}
              {formatDate(deletePaymentTarget.date)} and recompute the installment schedule. This
              cannot be undone.
            </>
          ) : null
        }
        onConfirm={confirmDeletePayment}
        onCancel={() => setDeletePaymentTarget(null)}
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
