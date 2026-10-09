import { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Field, Input, Select } from './ui/Field';
import { Spinner } from './ui/Feedback';
import { useToast } from './ui/Toast';
import { api } from '../lib/api';
import { formatCurrency, formatDate, todayISO } from '../lib/format';
import { PAYMENT_MODES } from '@loan/shared';
import type { PaymentMode, SettlementQuote } from '../lib/types';

/**
 * Early-settlement (foreclosure) modal. Fetches a settlement quote for the
 * chosen date (re-quoting when it changes), shows the breakdown, and on confirm
 * records the settlement as of that same date + closes the loan.
 */
export function SettlementModal({
  open,
  onClose,
  loanId,
  customerName,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  loanId: string;
  customerName: string;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [quote, setQuote] = useState<SettlementQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState<PaymentMode>('CASH');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(todayISO());
    setMode('CASH');
  }, [open]);

  // Interest-to-date depends on the as-of date, so re-quote whenever it changes.
  useEffect(() => {
    if (!open) return;
    setQuote(null);
    if (!date) return;
    setLoading(true);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .getSettlement(loanId, date)
        .then((q) => !cancelled && setQuote(q))
        .catch((e: unknown) => {
          if (!cancelled) toast.error(e instanceof Error ? e.message : 'Failed to load quote');
        })
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, loanId, date, toast]);

  async function onConfirm() {
    if (!quote) return;
    setSaving(true);
    try {
      // Settle with the date that produced the displayed quote.
      await api.settleLoan(loanId, { date: quote.asOf, mode });
      toast.success('Loan settled and closed');
      onSuccess();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Settlement failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pre-close / Settle Loan"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={saving || loading || !quote}>
            {saving ? 'Settling…' : 'Settle & Close'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Settle the loan for {customerName} as of the date below. This records a single settlement payment
          and marks the loan as closed.
        </p>

        {loading && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}

        {quote && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/60">
            <Row label="Remaining principal" value={formatCurrency(quote.remainingPrincipal)} />
            <Row label={`Interest up to ${formatDate(quote.asOf)}`} value={formatCurrency(quote.interestToDate)} />
            <Row label="Overdue amount" value={formatCurrency(quote.overdueDue)} />
            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 font-semibold text-slate-800 dark:border-slate-700 dark:text-slate-100">
              <span>Settlement amount</span>
              <span>{formatCurrency(quote.settlementAmount)}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Date" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
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
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-slate-600 dark:text-slate-300">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
