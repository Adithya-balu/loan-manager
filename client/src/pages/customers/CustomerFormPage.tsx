import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DUPLICATE_CUSTOMER_NUMBER } from '@loan/shared';
import { PageHeader } from '../../components/PageHeader';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, TextArea } from '../../components/ui/Field';
import { LoadingState } from '../../components/ui/Feedback';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import type { CustomerInput } from '../../lib/types';

const EMPTY: CustomerInput = {
  name: '',
  mobile: '',
  customerNumber: '',
  email: '',
  address: '',
  aadhaar: '',
  location: '',
};

export function CustomerFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState<CustomerInput>(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api
      .getCustomer(id)
      .then((res) => {
        if (cancelled) return;
        setForm({
          name: res.customer.name,
          mobile: res.customer.mobile,
          customerNumber: res.customer.customerNumber,
          email: res.customer.email ?? '',
          address: res.customer.address ?? '',
          aadhaar: res.customer.aadhaar ?? '',
          location: res.customer.location ?? '',
        });
        setPhotoPreview(res.customer.photoUrl ?? null);
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, toast]);

  function set<K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onPickPhoto(file: File) {
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Name is required';
    if (!/^\d{10}$/.test(form.mobile.trim())) next.mobile = 'Mobile must be exactly 10 digits';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Invalid email';
    if (form.aadhaar && !/^\d{12}$/.test(form.aadhaar.trim()))
      next.aadhaar = 'Aadhaar must be exactly 12 digits';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: CustomerInput = {
        name: form.name.trim(),
        mobile: form.mobile.trim(),
        customerNumber: form.customerNumber?.trim() || undefined,
        email: form.email?.trim() || null,
        address: form.address?.trim() || null,
        aadhaar: form.aadhaar?.trim() || null,
        location: form.location?.trim() || null,
      };
      const saved = isEdit && id ? await api.updateCustomer(id, payload) : await api.createCustomer(payload);
      if (photoFile) {
        try {
          await api.uploadCustomerPhoto(saved.id, photoFile);
        } catch {
          toast.error('Customer saved, but photo upload failed');
        }
      }
      toast.success(isEdit ? 'Customer updated' : 'Customer created');
      navigate(`/customers/${saved.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      if (message === DUPLICATE_CUSTOMER_NUMBER) {
        setErrors((prev) => ({ ...prev, customerNumber: message }));
      }
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <>
      <PageHeader title={isEdit ? 'Edit Customer' : 'New Customer'} />
      <Card className="max-w-2xl">
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50 text-slate-300 dark:border-slate-700 dark:bg-slate-800">
                {photoPreview ? (
                  <img src={photoPreview} alt="Customer" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl">☺</span>
                )}
              </div>
              <div>
                <Button type="button" variant="secondary" onClick={() => photoRef.current?.click()}>
                  {photoPreview ? 'Change photo' : 'Upload photo'}
                </Button>
                <input
                  ref={photoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onPickPhoto(file);
                  }}
                />
                <p className="mt-1 text-xs text-slate-400">JPG/PNG, up to 15 MB.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name" required error={errors.name}>
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="Mobile" required error={errors.mobile} hint="10-digit mobile number">
                <Input
                  inputMode="numeric"
                  maxLength={10}
                  value={form.mobile}
                  onChange={(e) => set('mobile', e.target.value.replace(/\D/g, ''))}
                />
              </Field>
              <Field
                label="Customer Number"
                error={errors.customerNumber}
                hint={isEdit ? undefined : 'Leave blank to auto-generate (e.g. C0007)'}
              >
                <Input
                  value={form.customerNumber ?? ''}
                  onChange={(e) => set('customerNumber', e.target.value)}
                />
              </Field>
              <Field label="Email" error={errors.email}>
                <Input
                  type="email"
                  value={form.email ?? ''}
                  onChange={(e) => set('email', e.target.value)}
                />
              </Field>
              <Field label="Aadhaar Number" error={errors.aadhaar} hint="12-digit Aadhaar (optional)">
                <Input
                  inputMode="numeric"
                  maxLength={12}
                  value={form.aadhaar ?? ''}
                  onChange={(e) => set('aadhaar', e.target.value.replace(/\D/g, ''))}
                />
              </Field>
              <Field label="Location">
                <Input
                  value={form.location ?? ''}
                  onChange={(e) => set('location', e.target.value)}
                  placeholder="City / area / village"
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
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Customer'}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
