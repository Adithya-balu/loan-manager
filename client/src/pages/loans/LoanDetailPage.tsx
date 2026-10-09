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
import { formatCurrency, formatDate, toDateInput } from '../../lib/format';
import { useI18n } from '../../i18n/I18nContext';
import type { EnrichedInstallment, PaymentWithInstallment } from '../../lib/types';

function isOpenInstallment(inst: EnrichedInstallment) {
  return inst.derivedStatus !== 'PAID' && inst.derivedStatus !== 'DEFAULTED' && inst.remaining > 0;
}

export function LoanDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { t, tNode } = useI18n();
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
  if (error || !data) return <ErrorState message={error ?? t('common.notFound')} onRetry={reload} />;

  const { rollup } = data;
  const hasPayments = data.payments.length > 0;
  // Payments are allocated oldest-first, so only the earliest open installment is collectable.
  const firstOpen = data.schedule.find(isOpenInstallment);
  const firstOpenId = firstOpen?.id;

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
      toast.success(t('loanDetail.paymentDeleted'));
      setDeletePaymentTarget(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('loanDetail.paymentDeleteFailed'));
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
          ? t('loanDetail.capitalizedDefaulted')
          : t('loanDetail.capitalized', {
              amount: formatCurrency(res.capitalized),
              count: res.reamortized,
            }),
      );
      setCapTarget(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.actionFailed'));
    } finally {
      setCapBusy(false);
    }
  }

  async function confirmDefaultLoan() {
    setDefaultBusy(true);
    try {
      await api.markLoanDefaulted(id);
      toast.success(t('loanDetail.loanDefaulted'));
      setDefaultLoanOpen(false);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.actionFailed'));
    } finally {
      setDefaultBusy(false);
    }
  }

  async function confirmDelete() {
    try {
      await api.deleteLoan(id);
      toast.success(t('loanDetail.loanDeleted'));
      navigate('/loans');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.deleteFailed'));
      setDeleteOpen(false);
    }
  }

  async function onUploadDoc(file: File) {
    setDocUploading(true);
    try {
      await api.uploadLoanDocument(id, file, docLabel.trim() || file.name);
      toast.success(t('loanDetail.docUploaded'));
      setDocLabel('');
      if (docFileRef.current) docFileRef.current.value = '';
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.uploadFailed'));
    } finally {
      setDocUploading(false);
    }
  }

  async function onDeleteDoc(docId: string) {
    try {
      await api.deleteLoanDocument(id, docId);
      toast.success(t('loanDetail.docRemoved'));
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.deleteFailed'));
    }
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {t('loanDetail.title', { frequency: t(`freq.${data.frequency}`) })}
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
              <Button onClick={() => openPayment(undefined)}>{t('loanDetail.recordPayment')}</Button>
            )}
            {rollup.loanDefaultEligible && (
              <Button variant="danger" onClick={() => setDefaultLoanOpen(true)}>
                {t('loanDetail.markDefaulted')}
              </Button>
            )}
            {!hasPayments && (
              <Link to={`/loans/${id}/edit`}>
                <Button variant="secondary">{t('common.edit')}</Button>
              </Link>
            )}
            <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
              {t('common.delete')}
            </Button>
          </>
        }
      />

      {rollup.loanDefaultEligible && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          {rollup.lastPaymentDate
            ? t('loanDetail.defaultEligibleSince', { date: formatDate(rollup.lastPaymentDate) })
            : t('loanDetail.defaultEligible')}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={t('loanDetail.principal')}
          value={formatCurrency(data.principal)}
          hint={`${data.annualRatePct}% · ${t(`method.${data.interestMethod}`)}`}
        />
        <StatCard label={t('loanDetail.outstanding')} value={formatCurrency(rollup.outstanding)} />
        <StatCard label={t('loanDetail.collected')} value={formatCurrency(rollup.totalPaid)} tone="positive" />
        <StatCard
          label={t('loanDetail.overdue')}
          value={formatCurrency(rollup.overdueAmount)}
          tone={rollup.overdueAmount > 0 ? 'danger' : 'default'}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('loanDetail.totalPayable')} value={formatCurrency(rollup.totalPayable)} />
        <StatCard label={t('loanDetail.totalInterest')} value={formatCurrency(rollup.totalInterest)} />
        <StatCard
          label={t('loanDetail.installmentsPaid')}
          value={`${rollup.paidInstallments} / ${data.installments}`}
        />
        <StatCard
          label={t('loanDetail.nextDue')}
          value={formatDate(rollup.nextDueDate)}
          hint={t('loanDetail.graceHint', { days: data.effectiveGraceDays })}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('loanDetail.details')} />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-400 dark:text-slate-500">{t('loanDetail.disbursementMode')}</dt>
              <dd className="text-slate-700 dark:text-slate-200">{data.disbursementMode}</dd>
              <dt className="text-slate-400 dark:text-slate-500">{t('loanDetail.disbursedOn')}</dt>
              <dd className="text-slate-700 dark:text-slate-200">{formatDate(data.disbursementDate)}</dd>
              {data.guarantorName && (
                <>
                  <dt className="text-slate-400 dark:text-slate-500">{t('loanDetail.guarantor')}</dt>
                  <dd className="text-slate-700 dark:text-slate-200">
                    {data.guarantorName}
                    {data.guarantorRelation ? ` (${data.guarantorRelation})` : ''}
                  </dd>
                </>
              )}
              {data.guarantorMobile && (
                <>
                  <dt className="text-slate-400 dark:text-slate-500">{t('loanDetail.guarantorMobile')}</dt>
                  <dd className="text-slate-700 dark:text-slate-200">{data.guarantorMobile}</dd>
                </>
              )}
              {data.guarantorAddress && (
                <>
                  <dt className="text-slate-400 dark:text-slate-500">{t('loanDetail.guarantorAddress')}</dt>
                  <dd className="text-slate-700 dark:text-slate-200">{data.guarantorAddress}</dd>
                </>
              )}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('loanDetail.documents')} subtitle={t('loanDetail.documentsSubtitle')} />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                placeholder={t('loanDetail.docLabelPlaceholder')}
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
              {docUploading && <span className="text-xs text-slate-400">{t('common.uploading')}</span>}
            </div>
            {data.documents.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">{t('loanDetail.noDocuments')}</p>
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
                      {t('common.remove')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title={t('loanDetail.schedule')}
          subtitle={t('loanDetail.installmentsCount', { count: data.schedule.length })}
          action={
            data.status === 'ACTIVE' && (
              <Button size="sm" variant="secondary" onClick={() => setSettleOpen(true)}>
                {t('loanDetail.settle')}
              </Button>
            )
          }
        />
        <Table>
          <THead>
            <TR>
              <TH>#</TH>
              <TH>{t('loanDetail.colDueDate')}</TH>
              <TH align="right">{t('loanDetail.colAmount')}</TH>
              <TH align="right">{t('loanDetail.colPaid')}</TH>
              <TH align="right">{t('loanDetail.colRemaining')}</TH>
              <TH align="center">{t('loanDetail.colStatus')}</TH>
              <TH align="center">{t('loanDetail.colLate')}</TH>
              <TH align="right">{t('loanDetail.colAction')}</TH>
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
                    {data.status === 'ACTIVE' && isOpenInstallment(inst) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={inst.id !== firstOpenId}
                        title={
                          inst.id !== firstOpenId
                            ? t('loanDetail.collectFirst', { sequence: firstOpen?.sequence ?? '' })
                            : undefined
                        }
                        onClick={() =>
                          openPayment({
                            installmentId: inst.id,
                            amount: inst.remaining,
                            sequence: inst.sequence,
                          })
                        }
                      >
                        {t('loanDetail.collect')}
                      </Button>
                    )}
                    {inst.actionRequired && (
                      <Button size="sm" variant="danger" onClick={() => setCapTarget(inst)}>
                        {inst.paidAmount > 0 ? t('loanDetail.capitalize') : t('loanDetail.default')}
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
        <CardHeader
          title={t('loanDetail.payments')}
          subtitle={t('loanDetail.paymentsCount', { count: data.payments.length })}
        />
        {data.payments.length === 0 ? (
          <EmptyState title={t('loanDetail.noPayments')} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('loanDetail.colDate')}</TH>
                <TH align="center">{t('loanDetail.colInstallment')}</TH>
                <TH>{t('loanDetail.colMode')}</TH>
                <TH>{t('loanDetail.colNote')}</TH>
                <TH align="right">{t('loanDetail.colAmount')}</TH>
                <TH align="right">{t('loanDetail.colActions')}</TH>
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
                        {t('common.edit')}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setDeletePaymentTarget(p)}>
                        {t('common.delete')}
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
        subtitle={t('loanDetail.paymentSubtitle', {
          name: data.customer.name,
          amount: formatCurrency(rollup.outstanding),
        })}
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
        title={t('loanDetail.deletePaymentTitle')}
        danger
        busy={deletePaymentBusy}
        confirmLabel={t('common.delete')}
        message={
          deletePaymentTarget
            ? tNode('loanDetail.deletePaymentMessage', {
                amount: <strong>{formatCurrency(deletePaymentTarget.amount)}</strong>,
                date: formatDate(deletePaymentTarget.date),
              })
            : null
        }
        onConfirm={confirmDeletePayment}
        onCancel={() => setDeletePaymentTarget(null)}
      />

      <ConfirmDialog
        open={capTarget !== null}
        title={
          capTarget?.paidAmount
            ? t('loanDetail.capitalizeTitle')
            : t('loanDetail.defaultInstallmentTitle')
        }
        danger
        busy={capBusy}
        confirmLabel={capTarget?.paidAmount ? t('loanDetail.capitalize') : t('loanDetail.default')}
        message={
          capTarget
            ? tNode('loanDetail.capitalizeMessage', {
                amount: <strong>{formatCurrency(capTarget.remaining)}</strong>,
                sequence: capTarget.sequence,
              })
            : ''
        }
        onConfirm={confirmCapitalize}
        onCancel={() => setCapTarget(null)}
      />

      <ConfirmDialog
        open={defaultLoanOpen}
        title={t('loanDetail.defaultLoanTitle')}
        danger
        busy={defaultBusy}
        confirmLabel={t('loanDetail.defaultLoanConfirm')}
        message={t('loanDetail.defaultLoanMessage')}
        onConfirm={confirmDefaultLoan}
        onCancel={() => setDefaultLoanOpen(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title={t('loanDetail.deleteLoanTitle')}
        danger
        confirmLabel={t('common.delete')}
        message={t('loanDetail.deleteLoanMessage')}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}
