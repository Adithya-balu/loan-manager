import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { ErrorState, LoadingState } from '../../components/ui/Feedback';
import { useToast } from '../../components/ui/Toast';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { FREQUENCY_LABEL } from '../../lib/format';
import type { LoanTypeConfig } from '../../lib/types';

export function SettingsPage() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.getConfig(), []);
  const [rows, setRows] = useState<LoanTypeConfig[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setRows(data.loanTypes.map((t) => ({ ...t })));
  }, [data]);

  function update(index: number, key: 'graceDays' | 'defaultThresholdDays', value: string) {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [key]: Math.max(0, Number(value) || 0) } : r)),
    );
  }

  async function onSave() {
    setSaving(true);
    try {
      await api.updateConfig(rows);
      toast.success('Settings saved');
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? 'No data'} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="System-wide defaults per loan type. Individual loans can override these."
      />

      <Card className="max-w-3xl">
        <CardHeader
          title="Loan Type Configuration"
          subtitle={`Currency ${data.currency} · Locale ${data.locale}`}
        />
        <CardBody>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 border-b border-slate-100 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Loan Type</span>
              <span>Grace Days</span>
              <span>Default Threshold (days)</span>
            </div>
            {rows.map((row, i) => (
              <div key={row.frequency} className="grid grid-cols-3 items-center gap-4">
                <span className="text-sm font-medium text-slate-800">
                  {FREQUENCY_LABEL[row.frequency]}
                </span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={row.graceDays}
                  onChange={(e) => update(i, 'graceDays', e.target.value)}
                />
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={row.defaultThresholdDays}
                  onChange={(e) => update(i, 'defaultThresholdDays', e.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <p>
              <strong>Grace days</strong> — how long after a due date a late payment is tolerated
              before the installment becomes "action required".
            </p>
            <p>
              <strong>Default threshold</strong> — days with no payment after which the whole loan
              becomes eligible to be marked as defaulted.
            </p>
          </div>

          <div className="mt-6 flex justify-end">
            <Button onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Settings'}
            </Button>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
