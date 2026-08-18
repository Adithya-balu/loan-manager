import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
        });
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

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Name is required';
    if (!form.mobile.trim()) next.mobile = 'Mobile is required';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Invalid email';
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
      };
      if (isEdit && id) {
        await api.updateCustomer(id, payload);
        toast.success('Customer updated');
        navigate(`/customers/${id}`);
      } else {
        const created = await api.createCustomer(payload);
        toast.success('Customer created');
        navigate(`/customers/${created.id}`);
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
      <PageHeader title={isEdit ? 'Edit Customer' : 'New Customer'} />
      <Card className="max-w-2xl">
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name" required error={errors.name}>
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="Mobile" required error={errors.mobile}>
                <Input value={form.mobile} onChange={(e) => set('mobile', e.target.value)} />
              </Field>
              <Field
                label="Customer Number"
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
