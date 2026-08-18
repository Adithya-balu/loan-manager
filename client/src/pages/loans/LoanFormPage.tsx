import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { INTEREST_METHODS, LOAN_FREQUENCIES } from '@loan/shared';
import { PageHeader } from '../../components/PageHeader';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { RiskBadge } from '../../components/ui/Badge';
import { Field, Input, Select } from '../../components/ui/Field';
import { LoadingState, Spinner } from '../../components/ui/Feedback';
import { useToast } from '../../components/ui/Toast';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { FREQUENCY_LABEL, formatCurrency, formatDate, todayISO, toDateInput } from '../../lib/format';
import type { CustomerListItem, InterestMethod, LoanFrequency, ScheduleSummary } from '../../lib/types';

interface FormState {
  customerId: string;
  principal: string;
  annualRatePct: string;
  frequency: LoanFrequency;
  interestMethod: InterestMethod;
  installments: string;
  disbursementDate: string;
  repaymentStartDate: string;
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
  graceDaysOverride: '',
  defaultThresholdDaysOverride: '',
});

export function LoanFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const { data: customers } = useApi(() => api.listCustomers(), []);
  const [form, setForm] = useState<FormState>(initialForm(searchParams.get('customerId') ?? ''));
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);
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
          graceDaysOverride: loan.graceDaysOverride?.toString() ?? '',
          defaultThresholdDaysOverride: loan.defaultThresholdDaysOverride?.toString() ?? '',
        });
        if (loan.payments.length > 0) setLocked(true);
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to load'))
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
          setPreviewError(e instanceof Error ? e.message : 'Preview failed'),
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
      toast.error('This loan already has payments and cannot be edited.');
      return;
    }
    if (!form.customerId) {
      toast.error('Select a customer');
      return;
    }
    if (!previewInputs.valid) {
      toast.error('Fill in valid loan terms');
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
        graceDaysOverride:
          form.graceDaysOverride.trim() === '' ? null : Number(form.graceDaysOverride),
        defaultThresholdDaysOverride:
          form.defaultThresholdDaysOverride.trim() === ''
            ? null
            : Number(form.defaultThresholdDaysOverride),
      };
      if (isEdit && id) {
        await api.updateLoan(id, payload);
        toast.success('Loan updated');
        navigate(`/loans/${id}`);
      } else {
        const created = await api.createLoan(payload);
        toast.success('Loan created');
        navigate(`/loans/${created.id}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <>
      <PageHeader title={isEdit ? 'Edit Loan' : 'New Loan'} />

      {locked && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Payments have already been recorded on this loan, so its terms are locked. Record
          repayments from the loan detail page instead.
        </div>
      )}

      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Loan Terms" />
          <CardBody className="space-y-4">
            <Field label="Customer" required>
              <Select
                value={form.customerId}
                onChange={(e) => set('customerId', e.target.value)}
                disabled={locked}
              >
                <option value="">Select a customer…</option>
                {customers?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.customerNumber})
                  </option>
                ))}
              </Select>
            </Field>
            {selectedCustomer && (
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-500">Customer risk</span>
                <RiskBadge risk={selectedCustomer.risk} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Field label="Principal" required>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.principal}
                  onChange={(e) => set('principal', e.target.value)}
                  disabled={locked}
                />
              </Field>
              <Field label="Annual Rate %" required>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.annualRatePct}
                  onChange={(e) => set('annualRatePct', e.target.value)}
                  disabled={locked}
                />
              </Field>
              <Field label="Repayment Frequency" required>
                <Select
                  value={form.frequency}
                  onChange={(e) => set('frequency', e.target.value as LoanFrequency)}
                  disabled={locked}
                >
                  {LOAN_FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {FREQUENCY_LABEL[f]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Interest Method" required>
                <Select
                  value={form.interestMethod}
                  onChange={(e) => set('interestMethod', e.target.value as InterestMethod)}
                  disabled={locked}
                >
                  {INTEREST_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m === 'FLAT' ? 'Flat Rate' : 'Reducing Balance'}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="No. of Installments" required>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={form.installments}
                  onChange={(e) => set('installments', e.target.value)}
                  disabled={locked}
                />
              </Field>
              <Field label="Disbursement Date" required>
                <Input
                  type="date"
                  value={form.disbursementDate}
                  onChange={(e) => set('disbursementDate', e.target.value)}
                  disabled={locked}
                />
              </Field>
              <Field label="Repayment Start Date" required>
                <Input
                  type="date"
                  value={form.repaymentStartDate}
                  onChange={(e) => set('repaymentStartDate', e.target.value)}
                  disabled={locked}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
              <Field label="Grace Days Override" hint="Blank uses the loan-type default">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={form.graceDaysOverride}
                  onChange={(e) => set('graceDaysOverride', e.target.value)}
                  disabled={locked}
                />
              </Field>
              <Field label="Default Threshold Override" hint="Days without payment before default">
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
                Cancel
              </Button>
              <Button type="submit" disabled={saving || locked}>
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Loan'}
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Repayment Schedule"
            subtitle="Live preview updates as you change terms"
            action={previewLoading ? <Spinner /> : undefined}
          />
          <CardBody>
            {previewError && <p className="text-sm text-rose-600">{previewError}</p>}
            {!preview && !previewError && (
              <p className="py-10 text-center text-sm text-slate-400">
                Enter principal, rate, installments and a start date to preview the schedule.
              </p>
            )}
            {preview && (
              <>
                <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <SummaryStat label="Per Installment" value={formatCurrency(preview.installmentAmount)} />
                  <SummaryStat label="Total Principal" value={formatCurrency(preview.totalPrincipal)} />
                  <SummaryStat label="Total Interest" value={formatCurrency(preview.totalInterest)} />
                  <SummaryStat label="Total Payable" value={formatCurrency(preview.totalPayable)} />
                </div>
                <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-100">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="text-slate-500">
                        <th className="px-2 py-2 text-left font-semibold">#</th>
                        <th className="px-2 py-2 text-left font-semibold">Due Date</th>
                        <th className="px-2 py-2 text-right font-semibold">Principal</th>
                        <th className="px-2 py-2 text-right font-semibold">Interest</th>
                        <th className="px-2 py-2 text-right font-semibold">Amount</th>
                        <th className="px-2 py-2 text-right font-semibold">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
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
    </>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold text-slate-800">{value}</p>
    </div>
  );
}
