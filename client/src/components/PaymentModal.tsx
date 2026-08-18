import { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Field, Input, Select, TextArea } from './ui/Field';
import { useToast } from './ui/Toast';
import { api } from '../lib/api';
import { formatCurrency, todayISO } from '../lib/format';
import { PAYMENT_MODES } from '@loan/shared';
import type { PaymentMode } from '../lib/types';

export interface PaymentPrefill {
  amount?: number;
  installmentId?: string | null;
  sequence?: number;
}

export function PaymentModal({
  open,
  onClose,
  loanId,
  title,
  subtitle,
  prefill,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  loanId: string;
  title?: string;
  subtitle?: string;
  prefill?: PaymentPrefill;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState(prefill?.amount ? String(prefill.amount) : '');
  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState<PaymentMode>('CASH');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset local state whenever the modal is (re)opened with a new prefill.
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    setAmount(prefill?.amount ? String(prefill.amount) : '');
    setDate(todayISO());
    setMode('CASH');
    setNote('');
  }
  if (!open && lastOpen) setLastOpen(false);

  async function onSubmit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setSaving(true);
    try {
      await api.createPayment({
        loanId,
        installmentId: prefill?.installmentId ?? null,
        amount: value,
        date,
        mode,
        note: note.trim() || null,
      });
      toast.success('Payment recorded');
      onSuccess();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? 'Record Payment'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Record Payment'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        {prefill?.sequence !== undefined && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Applying to installment #{prefill.sequence}
            {prefill.amount !== undefined && ` · due ${formatCurrency(prefill.amount)}`}. Extra
            amount flows to the next open installments automatically.
          </p>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount" required>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Date" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Mode">
          <Select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note">
          <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
