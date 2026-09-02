import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Card, CardBody, CardHeader, StatCard } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoanStatusBadge, RiskBadge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Feedback';
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { FREQUENCY_LABEL, formatCurrency, formatDate } from '../../lib/format';

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.getCustomer(id), [id]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [docLabel, setDocLabel] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? 'Not found'} onRetry={reload} />;

  const { customer, risk, loans, payments, totals } = data;

  async function onUpload(file: File) {
    setUploading(true);
    try {
      await api.uploadDocument(id, file, docLabel.trim() || file.name);
      toast.success('Document uploaded');
      setDocLabel('');
      if (fileRef.current) fileRef.current.value = '';
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function onDeleteDoc(docId: string) {
    try {
      await api.deleteDocument(id, docId);
      toast.success('Document removed');
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function onDeleteCustomer() {
    setDeleting(true);
    try {
      await api.deleteCustomer(id);
      toast.success('Customer deleted');
      navigate('/customers');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {customer.name}
            <RiskBadge risk={risk} />
          </span>
        }
        subtitle={`${customer.customerNumber} · ${customer.mobile}${
          customer.email ? ` · ${customer.email}` : ''
        }`}
        actions={
          <>
            <Link to={`/loans/new?customerId=${customer.id}`}>
              <Button>+ New Loan</Button>
            </Link>
            <Link to={`/customers/${customer.id}/edit`}>
              <Button variant="secondary">Edit</Button>
            </Link>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          </>
        }
      />

      {customer.address && (
        <p className="mb-4 text-sm text-slate-500">{customer.address}</p>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Disbursed" value={formatCurrency(totals.disbursed)} />
        <StatCard label="Outstanding" value={formatCurrency(totals.outstanding)} />
        <StatCard label="Collected" value={formatCurrency(totals.collected)} tone="positive" />
        <StatCard
          label="Overdue"
          value={formatCurrency(totals.overdue)}
          tone={totals.overdue > 0 ? 'danger' : 'default'}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Loans" subtitle={`${loans.length} total`} />
          {loans.length === 0 ? (
            <EmptyState title="No loans yet" />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Type</TH>
                  <TH align="right">Principal</TH>
                  <TH align="right">Outstanding</TH>
                  <TH align="center">Status</TH>
                </TR>
              </THead>
              <TBody>
                {loans.map((l) => (
                  <TR key={l.id} onClick={() => navigate(`/loans/${l.id}`)}>
                    <TD>
                      {FREQUENCY_LABEL[l.frequency]} · {l.interestMethod}
                    </TD>
                    <TD align="right">{formatCurrency(l.principal)}</TD>
                    <TD align="right">{formatCurrency(l.rollup.outstanding)}</TD>
                    <TD align="center">
                      <LoanStatusBadge status={l.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Documents" subtitle="KYC & supporting files" />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Label (optional)"
                value={docLabel}
                onChange={(e) => setDocLabel(e.target.value)}
              />
              <input
                ref={fileRef}
                type="file"
                className="text-sm text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onUpload(file);
                }}
              />
              {uploading && <span className="text-xs text-slate-400">Uploading…</span>}
            </div>
            {customer.documents.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">No documents uploaded.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {customer.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between py-2">
                    <div>
                      <a
                        href={`/api/customers/${customer.id}/documents/${d.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-indigo-600 hover:underline"
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
        <CardHeader title="Repayment History" subtitle={`${payments.length} payments`} />
        {payments.length === 0 ? (
          <EmptyState title="No payments recorded" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Loan</TH>
                <TH>Mode</TH>
                <TH>Note</TH>
                <TH align="right">Amount</TH>
              </TR>
            </THead>
            <TBody>
              {payments.map((p) => (
                <TR key={p.id} onClick={() => navigate(`/loans/${p.loanId}`)}>
                  <TD>{formatDate(p.date)}</TD>
                  <TD>{FREQUENCY_LABEL[p.loan.frequency]}</TD>
                  <TD>{p.mode}</TD>
                  <TD>{p.note ?? '—'}</TD>
                  <TD align="right">{formatCurrency(p.amount)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete customer?"
        danger
        busy={deleting}
        confirmLabel="Delete"
        message="This permanently removes the customer and all associated loans, schedules and payments. This cannot be undone."
        onConfirm={onDeleteCustomer}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
