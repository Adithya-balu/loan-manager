import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Feedback';
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui/Table';
import { PaymentModal, type PaymentPrefill } from '../../components/PaymentModal';
import { useToast } from '../../components/ui/Toast';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { FREQUENCY_LABEL, formatCurrency, formatDate } from '../../lib/format';
import type { InstallmentAction, LoanAction } from '../../lib/types';

export function ActionRequiredPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.getActionRequired(), []);

  const [payOpen, setPayOpen] = useState(false);
  const [payLoanId, setPayLoanId] = useState('');
  const [prefill, setPrefill] = useState<PaymentPrefill | undefined>(undefined);
  const [capTarget, setCapTarget] = useState<InstallmentAction | null>(null);
  const [capBusy, setCapBusy] = useState(false);
  const [loanTarget, setLoanTarget] = useState<LoanAction | null>(null);
  const [loanBusy, setLoanBusy] = useState(false);

  function collect(a: InstallmentAction) {
    setPayLoanId(a.loanId);
    setPrefill({ installmentId: a.installmentId, amount: a.remaining, sequence: a.sequence });
    setPayOpen(true);
  }

  async function confirmCapitalize() {
    if (!capTarget) return;
    setCapBusy(true);
    try {
      const res = await api.capitalizeInstallment(capTarget.installmentId);
      toast.success(
        res.loanDefaulted
          ? 'Installment capitalized. Loan marked as defaulted.'
          : `Capitalized ${formatCurrency(res.capitalized)}; ${res.reamortized} installments re-amortized.`,
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
    if (!loanTarget) return;
    setLoanBusy(true);
    try {
      await api.markLoanDefaulted(loanTarget.loanId);
      toast.success('Loan marked as defaulted');
      setLoanTarget(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setLoanBusy(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? 'No data'} onRetry={reload} />;

  const nothing = data.installmentActions.length === 0 && data.loanActions.length === 0;

  return (
    <>
      <PageHeader
        title="Action Required"
        subtitle="Overdue installments past their grace window and loans eligible to be defaulted."
      />

      {nothing ? (
        <Card>
          <EmptyState
            title="All clear"
            description="No installments are past grace and no loans have crossed the default threshold."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Installments past grace"
              subtitle="Decide whether to collect, capitalize a partial shortfall, or default."
            />
            {data.installmentActions.length === 0 ? (
              <EmptyState title="No installment actions" />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Customer</TH>
                    <TH>Type</TH>
                    <TH align="center">Inst.</TH>
                    <TH>Due Date</TH>
                    <TH align="center">Late</TH>
                    <TH align="right">Remaining</TH>
                    <TH align="center">Kind</TH>
                    <TH align="right">Action</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.installmentActions.map((a) => (
                    <TR key={a.installmentId}>
                      <TD>
                        <button className="text-left" onClick={() => navigate(`/loans/${a.loanId}`)}>
                          <div className="font-medium text-slate-800 hover:text-indigo-600">
                            {a.customerName}
                          </div>
                          <div className="text-xs text-slate-400">{a.customerNumber}</div>
                        </button>
                      </TD>
                      <TD>{FREQUENCY_LABEL[a.frequency]}</TD>
                      <TD align="center">#{a.sequence}</TD>
                      <TD>{formatDate(a.dueDate)}</TD>
                      <TD align="center">
                        <span className="font-medium text-rose-600">{a.daysPastDue}d</span>
                        <span className="text-xs text-slate-400"> / {a.graceDays}d</span>
                      </TD>
                      <TD align="right">{formatCurrency(a.remaining)}</TD>
                      <TD align="center">
                        <Badge tone={a.kind === 'PARTIAL' ? 'amber' : 'red'}>{a.kind}</Badge>
                      </TD>
                      <TD align="right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="secondary" onClick={() => collect(a)}>
                            Collect
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => setCapTarget(a)}>
                            {a.kind === 'PARTIAL' ? 'Capitalize' : 'Default'}
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Loans eligible for default"
              subtitle="No payment activity beyond the default threshold."
            />
            {data.loanActions.length === 0 ? (
              <EmptyState title="No loan-level actions" />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Customer</TH>
                    <TH>Type</TH>
                    <TH align="right">Outstanding</TH>
                    <TH>Last Payment</TH>
                    <TH>Next Due</TH>
                    <TH align="right">Action</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.loanActions.map((a) => (
                    <TR key={a.loanId}>
                      <TD>
                        <button className="text-left" onClick={() => navigate(`/loans/${a.loanId}`)}>
                          <div className="font-medium text-slate-800 hover:text-indigo-600">
                            {a.customerName}
                          </div>
                          <div className="text-xs text-slate-400">{a.customerNumber}</div>
                        </button>
                      </TD>
                      <TD>{FREQUENCY_LABEL[a.frequency]}</TD>
                      <TD align="right">{formatCurrency(a.outstanding)}</TD>
                      <TD>{a.lastPaymentDate ? formatDate(a.lastPaymentDate) : 'None'}</TD>
                      <TD>{a.nextDueDate ? formatDate(a.nextDueDate) : '—'}</TD>
                      <TD align="right">
                        <Button size="sm" variant="danger" onClick={() => setLoanTarget(a)}>
                          Mark Defaulted
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      )}

      {payLoanId && (
        <PaymentModal
          open={payOpen}
          onClose={() => setPayOpen(false)}
          loanId={payLoanId}
          prefill={prefill}
          title="Collect Repayment"
          onSuccess={reload}
        />
      )}

      <ConfirmDialog
        open={capTarget !== null}
        title={capTarget?.kind === 'PARTIAL' ? 'Capitalize shortfall?' : 'Mark installment defaulted?'}
        danger
        busy={capBusy}
        confirmLabel={capTarget?.kind === 'PARTIAL' ? 'Capitalize' : 'Default'}
        message={
          capTarget ? (
            <>
              The unpaid <strong>{formatCurrency(capTarget.remaining)}</strong> on installment #
              {capTarget.sequence} ({capTarget.customerName}) will be added to the outstanding
              principal and the remaining installments will be re-amortized. This cannot be undone.
            </>
          ) : (
            ''
          )
        }
        onConfirm={confirmCapitalize}
        onCancel={() => setCapTarget(null)}
      />

      <ConfirmDialog
        open={loanTarget !== null}
        title="Mark loan as defaulted?"
        danger
        busy={loanBusy}
        confirmLabel="Mark Defaulted"
        message={
          loanTarget
            ? `This closes ${loanTarget.customerName}'s loan (outstanding ${formatCurrency(loanTarget.outstanding)}) as defaulted.`
            : ''
        }
        onConfirm={confirmDefaultLoan}
        onCancel={() => setLoanTarget(null)}
      />
    </>
  );
}
