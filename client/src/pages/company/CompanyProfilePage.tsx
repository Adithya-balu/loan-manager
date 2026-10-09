import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, TextArea } from '../../components/ui/Field';
import { ErrorState, LoadingState } from '../../components/ui/Feedback';
import { useToast } from '../../components/ui/Toast';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import type { CompanyInput } from '../../lib/types';

const EMPTY: CompanyInput = { name: '', address: '', phone: '', email: '' };

export function CompanyProfilePage() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.getCompany(), []);
  const [form, setForm] = useState<CompanyInput>(EMPTY);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data) {
      setForm({
        name: data.name,
        address: data.address ?? '',
        phone: data.phone ?? '',
        email: data.email ?? '',
      });
      setLogoUrl(data.logoUrl ?? null);
    }
  }, [data]);

  function set<K extends keyof CompanyInput>(key: K, value: CompanyInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSave() {
    if (!form.name.trim()) {
      toast.error('Company name is required');
      return;
    }
    setSaving(true);
    try {
      await api.updateCompany({
        name: form.name.trim(),
        address: form.address?.trim() || null,
        phone: form.phone?.trim() || null,
        email: form.email?.trim() || null,
      });
      toast.success('Company profile saved');
      reload();
      window.dispatchEvent(new Event('company:updated'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function onUploadLogo(file: File) {
    setUploading(true);
    try {
      const updated = await api.uploadCompanyLogo(file);
      setLogoUrl(updated.logoUrl ?? null);
      toast.success('Logo updated');
      if (logoRef.current) logoRef.current.value = '';
      reload();
      window.dispatchEvent(new Event('company:updated'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? 'No data'} onRetry={reload} />;

  return (
    <>
      <PageHeader title="Company Profile" subtitle="Branding and contact details for your organisation." />

      <Card className="max-w-2xl">
        <CardHeader title="Company Details" />
        <CardBody className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-slate-300 dark:border-slate-700 dark:bg-slate-800">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <span className="text-2xl">🏢</span>
              )}
            </div>
            <div>
              <Button
                type="button"
                variant="secondary"
                disabled={uploading}
                onClick={() => logoRef.current?.click()}
              >
                {uploading ? 'Uploading…' : logoUrl ? 'Change logo' : 'Upload logo'}
              </Button>
              <input
                ref={logoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onUploadLogo(file);
                }}
              />
              <p className="mt-1 text-xs text-slate-400">Shown in the sidebar. PNG/JPG/SVG.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Company Name" required>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email ?? ''}
                onChange={(e) => set('email', e.target.value)}
              />
            </Field>
          </div>
          <Field label="Address">
            <TextArea
              rows={3}
              value={form.address ?? ''}
              onChange={(e) => set('address', e.target.value)}
            />
          </Field>

          <div className="flex justify-end">
            <Button onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Profile'}
            </Button>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
