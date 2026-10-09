import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { INTEREST_METHODS, LOAN_FREQUENCIES, PAYMENT_MODES } from '@loan/shared';
import { PageHeader } from '../../components/PageHeader';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { RiskBadge } from '../../components/ui/Badge';
import { Field, Input, Select } from '../../components/ui/Field';
import { LoadingState, Spinner } from '../../components/ui/Feedback';
import { useToast } from '../../components/ui/Toast';
import { CustomerQuickCreate } from '../../components/CustomerQuickCreate';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { formatCurrency, formatDate, todayISO, toDateInput } from '../../lib/format';
import { useI18n } from '../../i18n/I18nContext';
import type {
  CustomerListItem,
  InterestMethod,
  LoanFrequency,
  PaymentMode,
  ScheduleSummary,
} from '../../lib/types';

interface FormState {
  customerId: string;
  principal: string;
  annualRatePct: string;
  frequency: LoanFrequency;
  interestMethod: InterestMethod;
  installments: string;
  disbursementDate: string;
  repaymentStartDate: string;
  disbursementMode: PaymentMode;
  guarantorName: string;
  guarantorMobile: string;
  guarantorRelation: string;
  guarantorAddress: string;
  graceDaysOverride: string;
  defaultThresholdDaysOverride: string;
}

const initialForm = (customerId = ''): FormState => ({
  customerId,
  principal: '',
  annualRatePct: '',
  frequency: 'MONTHLY',
  interestMethod: 'REDUCING',
  installments: '',
  disbursementDate: todayISO(),
  repaymentStartDate: todayISO(),
  disbursementMode: 'CASH',
  guarantorName: '',
  guarantorMobile: '',
  guarantorRelation: '',
  guarantorAddress: '',
  graceDaysOverride: '',
  defaultThresholdDaysOverride: '',
});

export function LoanFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useI18n();

  const { data: customers, reload: reloadCustomers } = useApi(() => api.listCustomers(), []);
  const [form, setForm] = useState<FormState>(initialForm(searchParams.get('customerId') ?? ''));
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [showGuarantor, setShowGuarantor] = useState(false);
  const [preview, setPreview] = useState<ScheduleSummary | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api
      .getLoan(id)
      .then((loan) => {
        if (cancelled) return;
        setForm({
          customerId: loan.customerId,
          principal: String(loan.principal),
          annualRatePct: String(loan.annualRatePct),
          frequency: loan.frequency,
          interestMethod: loan.interestMethod,
          installments: String(loan.installments),
          disbursementDate: toDateInput(loan.disbursementDate),
          repaymentStartDate: toDateInput(loan.repaymentStartDate),
          disbursementMode: loan.disbursementMode ?? 'CASH',
          guarantorName: loan.guarantorName ?? '',
          guarantorMobile: loan.guarantorMobile ?? '',
          guarantorRelation: loan.guarantorRelation ?? '',
          guarantorAddress: loan.guarantorAddress ?? '',
          graceDaysOverride: loan.graceDaysOverride?.toString() ?? '',
          defaultThresholdDaysOverride: loan.defaultThresholdDaysOverride?.toString() ?? '',
        });
        if (
          loan.guarantorName ||
          loan.guarantorMobile ||
          loan.guarantorRelation ||
          loan.guarantorAddress
        ) {
          setShowGuarantor(true);
        }
        if (loan.payments.length > 0) setLocked(true);
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : t('common.failedToLoad')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, toast]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const previewInputs = useMemo(() => {
    const principal = Number(form.principal);
    const annualRatePct = Number(form.annualRatePct);
    const installments = Number(form.installments);
    const valid =
      principal > 0 &&
      annualRatePct >= 0 &&
      Number.isInteger(installments) &&
      installments > 0 &&
      Boolean(form.repaymentStartDate);
    return {
      valid,
      body: {
        principal,
        annualRatePct,
        frequency: form.frequency,
        interestMethod: form.interestMethod,
        installments,
        repaymentStartDate: form.repaymentStartDate,
      },
    };
  }, [
    form.principal,
    form.annualRatePct,
    form.installments,
    form.frequency,
    form.interestMethod,
    form.repaymentStartDate,
  ]);

  useEffect(() => {
    if (!previewInputs.valid) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setPreviewLoading(true);
      setPreviewError(null);
      api
        .previewSchedule(previewInputs.body)
        .then(setPreview)
        .catch((e: unknown) =>
          setPreviewError(e instanceof Error ? e.message : t('loanForm.previewFailed')),
        )
        .finally(() => setPreviewLoading(false));
    }, 400);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [previewInputs]);

  const selectedCustomer: CustomerListItem | undefined = customers?.find(
    (c) => c.id === form.customerId,
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (locked) {
      toast.error(t('loanForm.lockedToast'));
      return;
    }
    if (!form.customerId) {
      toast.error(t('loanForm.selectCustomerToast'));
      return;
    }
    if (!previewInputs.valid) {
      toast.error(t('loanForm.invalidTermsToast'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        customerId: form.customerId,
        principal: Number(form.principal),
        annualRatePct: Number(form.annualRatePct),
        frequency: form.frequency,
        interestMethod: form.interestMethod,
        installments: Number(form.installments),
        disbursementDate: form.disbursementDate,
        repaymentStartDate: form.repaymentStartDate,
        disbursementMode: form.disbursementMode,
        guarantorName: form.guarantorName.trim() || null,
        guarantorMobile: form.guarantorMobile.trim() || null,
        guarantorRelation: form.guarantorRelation.trim() || null,
        guarantorAddress: form.guarantorAddress.trim() || null,
        graceDaysOverride:
          form.graceDaysOverride.trim() === '' ? null : Number(form.graceDaysOverride),
        defaultThresholdDaysOverride:
          form.defaultThresholdDaysOverride.trim() === ''
            ? null
            : Number(form.defaultThresholdDaysOverride),
      };
      if (isEdit && id) {
        await api.updateLoan(id, payload);
        toast.success(t('loanForm.updated'));
        navigate(`/loans/${id}`);
      } else {
        const created = await api.createLoan(payload);
        toast.success(t('loanForm.created'));
        navigate(`/loans/${created.id}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <>
      <PageHeader title={isEdit ? t('loanForm.editTitle') : t('loanForm.newTitle')} />

      {locked && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          {t('loanForm.locked')}
        </div>
      )}

      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('loanForm.terms')} />
          <CardBody className="space-y-4">
            <Field label={t('loanForm.customer')} required>
              <div className="flex items-center gap-2">
                <Select
                  value={form.customerId}
                  onChange={(e) => set('customerId', e.target.value)}
                  disabled={locked}
                >
                  <option value="">{t('loanForm.selectCustomer')}</option>
                  {customers?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.customerNumber})
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0"
                  disabled={locked}
                  onClick={() => setQuickCreateOpen(true)}
                >
                  {t('loanForm.newCustomer')}
                </Button>
              </div>
            </Field>
            {selectedCustomer && (
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900/50">
                <span className="text-slate-500 dark:text-slate-400">{t('loanForm.customerRisk')}</span>
                <RiskBadge risk={selectedCustomer.risk} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Field label={t('loanForm.principal')} required>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.principal}
                  onChange={(e) => set('principal', e.target.value)}
                  disabled={locked}
                />
              </Field>
              <Field label={t('loanForm.annualRate')} required>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.annualRatePct}
                  onChange={(e) => set('annualRatePct', e.target.value)}
                  disabled={locked}
                />
              </Field>
              <Field label={t('loanForm.frequency')} required>
                <Select
                  value={form.frequency}
                  onChange={(e) => set('frequency', e.target.value as LoanFrequency)}
                  disabled={locked}
                >
                  {LOAN_FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {t(`freq.${f}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('loanForm.interestMethod')} required>
                <Select
                  value={form.interestMethod}
                  onChange={(e) => set('interestMethod', e.target.value as InterestMethod)}
                  disabled={locked}
                >
                  {INTEREST_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t(`method.${m}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('loanForm.installments')} required>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={form.installments}
                  onChange={(e) => set('installments', e.target.value)}
                  disabled={locked}
                />
              </Field>
              <Field label={t('loanForm.disbursementDate')} required>
                <Input
                  type="date"
                  value={form.disbursementDate}
                  onChange={(e) => set('disbursementDate', e.target.value)}
                  disabled={locked}
                />
              </Field>
              <Field label={t('loanForm.repaymentStartDate')} required>
                <Input
                  type="date"
                  value={form.repaymentStartDate}
                  onChange={(e) => set('repaymentStartDate', e.target.value)}
                  disabled={locked}
                />
              </Field>
              <Field label={t('loanForm.disbursementMode')} hint={t('loanForm.disbursementModeHint')}>
                <Select
                  value={form.disbursementMode}
                  onChange={(e) => set('disbursementMode', e.target.value as PaymentMode)}
                  disabled={locked}
                >
                  {PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="border-t border-slate-100 pt-4 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setShowGuarantor((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                aria-expanded={showGuarantor}
              >
                <span className="w-3">{showGuarantor ? '▾' : '▸'}</span>
                {showGuarantor ? t('loanForm.guarantorOptional') : t('loanForm.addGuarantor')}
              </button>
              {showGuarantor && (
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <Field label={t('loanForm.guarantorName')}>
                    <Input
                      value={form.guarantorName}
                      onChange={(e) => set('guarantorName', e.target.value)}
                      disabled={locked}
                    />
                  </Field>
                  <Field label={t('loanForm.guarantorMobile')}>
                    <Input
                      inputMode="numeric"
                      value={form.guarantorMobile}
                      onChange={(e) => set('guarantorMobile', e.target.value.replace(/\D/g, ''))}
                      disabled={locked}
                    />
                  </Field>
                  <Field label={t('loanForm.relation')}>
                    <Input
                      value={form.guarantorRelation}
                      onChange={(e) => set('guarantorRelation', e.target.value)}
                      placeholder={t('loanForm.relationPlaceholder')}
                      disabled={locked}
                    />
                  </Field>
                  <Field label={t('loanForm.guarantorAddress')}>
                    <Input
                      value={form.guarantorAddress}
                      onChange={(e) => set('guarantorAddress', e.target.value)}
                      disabled={locked}
                    />
                  </Field>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 dark:border-slate-700">
              <Field label={t('loanForm.graceOverride')} hint={t('loanForm.graceOverrideHint')}>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={form.graceDaysOverride}
                  onChange={(e) => set('graceDaysOverride', e.target.value)}
                  disabled={locked}
                />
              </Field>
              <Field label={t('loanForm.defaultOverride')} hint={t('loanForm.defaultOverrideHint')}>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={form.defaultThresholdDaysOverride}
                  onChange={(e) => set('defaultThresholdDaysOverride', e.target.value)}
                  disabled={locked}
                />
              </Field>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={saving || locked}>
                {saving ? t('common.saving') : isEdit ? t('loanForm.saveChanges') : t('loanForm.create')}
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t('loanForm.schedule')}
            subtitle={t('loanForm.scheduleSubtitle')}
            action={previewLoading ? <Spinner /> : undefined}
          />
          <CardBody>
            {previewError && <p className="text-sm text-rose-600">{previewError}</p>}
            {!preview && !previewError && (
              <p className="py-10 text-center text-sm text-slate-400">
                {t('loanForm.previewEmpty')}
              </p>
            )}
            {preview && (
              <>
                <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <SummaryStat label={t('loanForm.perInstallment')} value={formatCurrency(preview.installmentAmount)} />
                  <SummaryStat label={t('loanForm.totalPrincipal')} value={formatCurrency(preview.totalPrincipal)} />
                  <SummaryStat label={t('loanForm.totalInterest')} value={formatCurrency(preview.totalInterest)} />
                  <SummaryStat label={t('loanForm.totalPayable')} value={formatCurrency(preview.totalPayable)} />
                </div>
                <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-700">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900/80">
                      <tr className="text-slate-500 dark:text-slate-400">
                        <th className="px-2 py-2 text-left font-semibold">#</th>
                        <th className="px-2 py-2 text-left font-semibold">{t('loanForm.colDueDate')}</th>
                        <th className="px-2 py-2 text-right font-semibold">{t('loanForm.colPrincipal')}</th>
                        <th className="px-2 py-2 text-right font-semibold">{t('loanForm.colInterest')}</th>
                        <th className="px-2 py-2 text-right font-semibold">{t('loanForm.colAmount')}</th>
                        <th className="px-2 py-2 text-right font-semibold">{t('loanForm.colBalance')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {preview.rows.map((r) => (
                        <tr key={r.sequence}>
                          <td className="px-2 py-1.5 text-slate-500">{r.sequence}</td>
                          <td className="px-2 py-1.5">{formatDate(r.dueDate)}</td>
                          <td className="px-2 py-1.5 text-right">
                            {formatCurrency(r.principalComponent)}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {formatCurrency(r.interestComponent)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-medium">
                            {formatCurrency(r.amountDue)}
                          </td>
                          <td className="px-2 py-1.5 text-right text-slate-500">
                            {formatCurrency(r.closingBalance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </form>

      <CustomerQuickCreate
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={(customer) => {
          reloadCustomers();
          set('customerId', customer.id);
        }}
      />
    </>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/50">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="font-semibold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}
