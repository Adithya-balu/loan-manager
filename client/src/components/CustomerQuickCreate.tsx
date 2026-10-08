import { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Field, Input } from './ui/Field';
import { useToast } from './ui/Toast';
import { api } from '../lib/api';
import type { Customer } from '../lib/types';

/**
 * Lightweight modal to create a customer inline (e.g. from the loan form)
 * without navigating away. Calls back with the created customer.
 */
export function CustomerQuickCreate({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset fields whenever the modal (re)opens.
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    setName('');
    setMobile('');
    setAadhaar('');
    setLocation('');
    setErrors({});
  }
  if (!open && lastOpen) setLastOpen(false);

  async function onSubmit() {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Name is required';
    if (!/^\d{10}$/.test(mobile.trim())) next.mobile = 'Mobile must be exactly 10 digits';
    if (aadhaar && !/^\d{12}$/.test(aadhaar.trim())) next.aadhaar = 'Aadhaar must be 12 digits';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const created = await api.createCustomer({
        name: name.trim(),
        mobile: mobile.trim(),
        aadhaar: aadhaar.trim() || null,
        location: location.trim() || null,
      });
      toast.success('Customer created');
      onCreated(created);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create customer');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Customer"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Create & Select'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Mobile" required error={errors.mobile} hint="10-digit mobile number">
          <Input
            inputMode="numeric"
            maxLength={10}
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Aadhaar" error={errors.aadhaar} hint="Optional, 12 digits">
            <Input
              inputMode="numeric"
              maxLength={12}
              value={aadhaar}
              onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <Field label="Location">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
