import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PAYMENT_MODES } from '@loan/shared';
import { PageHeader } from '../../components/PageHeader';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, TextArea } from '../../components/ui/Field';
import { ErrorState, LoadingState } from '../../components/ui/Feedback';
import { useToast } from '../../components/ui/Toast';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { FREQUENCY_LABEL, formatCurrency, todayISO } from '../../lib/format';
import type { PaymentMode } from '../../lib/types';

export function PaymentFormPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const { data: loans, loading, error, reload } = useApi(() => api.listLoans(), []);

  const [customerId, setCustomerId] = useState(searchParams.get('customerId') ?? '');
  const [loanId, setLoanId] = useState(searchParams.get('loanId') ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState<PaymentMode>('CASH');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const activeLoans = useMemo(() => (loans ?? []).filter((l) => l.status === 'ACTIVE'), [loans]);

  const customers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; customerNumber: string }>();
    for (const l of activeLoans) {
      if (!map.has(l.customerId)) {
        map.set(l.customerId, {
          id: l.customerId,
          name: l.customer.name,
          customerNumber: l.customer.customerNumber,
        });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [activeLoans]);

  const customerLoans = useMemo(
    () => activeLoans.filter((l) => l.customerId === customerId),
    [activeLoans, customerId],
  );

  const selectedLoan = activeLoans.find((l) => l.id === loanId);

  // Keep selected customer in sync when a loan is preselected via query param.
  const preselectCustomer = selectedLoan?.customerId;
  if (preselectCustomer && !customerId) setCustomerId(preselectCustomer);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!loanId) {
      toast.error('Select a loan');
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setSaving(true);
    try {
      await api.createPayment({
        loanId,
        amount: value,
        date,
        mode,
        note: note.trim() || null,
      });
      toast.success('Payment recorded');
      navigate(`/loans/${loanId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Record Payment" subtitle="Allocated to the oldest open installments first." />
      <Card className="max-w-2xl">
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Customer" required>
                <Select
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    setLoanId('');
                  }}
                >
                  <option value="">Select a customer…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.customerNumber})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Loan" required>
                <Select
                  value={loanId}
                  onChange={(e) => setLoanId(e.target.value)}
                  disabled={!customerId}
                >
                  <option value="">Select a loan…</option>
                  {customerLoans.map((l) => (
                    <option key={l.id} value={l.id}>
                      {FREQUENCY_LABEL[l.frequency]} · {l.interestMethod} · outstanding{' '}
                      {formatCurrency(l.rollup.outstanding)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {selectedLoan && (
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-500">Outstanding</span>
                <span className="font-semibold text-slate-800">
                  {formatCurrency(selectedLoan.rollup.outstanding)}
                  {selectedLoan.rollup.nextDueDate && (
                    <span className="ml-2 font-normal text-slate-400">
                      next due {selectedLoan.rollup.nextDueDate}
                    </span>
                  )}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Field label="Amount" required>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Field label="Date" required>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Mode">
                <Select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
                  {PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Note">
              <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Record Payment'}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
