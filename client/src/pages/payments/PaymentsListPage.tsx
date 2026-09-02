import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { ConfirmDialog } from '../../components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Feedback';
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';
import { PaymentModal, type PaymentEditTarget } from '../../components/PaymentModal';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { FREQUENCY_LABEL, formatCurrency, formatDate, toDateInput } from '../../lib/format';
import type { PaymentListItem } from '../../lib/types';

export function PaymentsListPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.listPayments(), []);
  const [query, setQuery] = useState('');
  const [editingPayment, setEditingPayment] = useState<
    { loanId: string; target: PaymentEditTarget } | undefined
  >(undefined);
  const [deleteTarget, setDeleteTarget] = useState<PaymentListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (p) =>
        p.customer.name.toLowerCase().includes(q) ||
        p.customer.customerNumber.toLowerCase().includes(q),
    );
  }, [data, query]);

  const total = useMemo(() => filtered.reduce((a, p) => a + p.amount, 0), [filtered]);

  function openEdit(p: PaymentListItem) {
    setEditingPayment({
      loanId: p.loanId,
      target: { id: p.id, amount: p.amount, date: toDateInput(p.date), mode: p.mode, note: p.note },
    });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.deletePayment(deleteTarget.id);
      toast.success('Payment deleted');
      setDeleteTarget(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete payment');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Repayments"
        subtitle="All collected repayments across every loan."
        actions={
          <Link to="/repayments/new">
            <Button>+ Record Payment</Button>
          </Link>
        }
      />

      <Card>
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 p-3">
          <Input
            placeholder="Search by customer…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-xs"
          />
          <span className="text-sm text-slate-500">
            Total: <strong className="text-slate-700">{formatCurrency(total)}</strong>
          </span>
        </div>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No payments yet"
            action={
              <Link to="/repayments/new">
                <Button>+ Record Payment</Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Customer</TH>
                <TH>Loan</TH>
                <TH align="center">Installment</TH>
                <TH>Mode</TH>
                <TH align="right">Amount</TH>
                <TH align="right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((p) => (
                <TR key={p.id} onClick={() => navigate(`/loans/${p.loanId}`)}>
                  <TD>{formatDate(p.date)}</TD>
                  <TD>
                    <div className="font-medium text-slate-800">{p.customer.name}</div>
                    <div className="text-xs text-slate-400">{p.customer.customerNumber}</div>
                  </TD>
                  <TD>{FREQUENCY_LABEL[p.loan.frequency]}</TD>
                  <TD align="center">{p.installment ? `#${p.installment.sequence}` : '—'}</TD>
                  <TD>{p.mode}</TD>
                  <TD align="right">{formatCurrency(p.amount)}</TD>
                  <TD align="right">
                    <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setDeleteTarget(p)}>
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

      {editingPayment && (
        <PaymentModal
          open={!!editingPayment}
          onClose={() => setEditingPayment(undefined)}
          loanId={editingPayment.loanId}
          editTarget={editingPayment.target}
          onSuccess={reload}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete payment?"
        danger
        busy={deleteBusy}
        confirmLabel="Delete"
        message={
          deleteTarget ? (
            <>
              This will remove the payment of <strong>{formatCurrency(deleteTarget.amount)}</strong>{' '}
              dated {formatDate(deleteTarget.date)} and recompute the installment schedule. This
              cannot be undone.
            </>
          ) : null
        }
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
