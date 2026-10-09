import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import type { InstallmentAction } from '../../lib/types';
import { renderPage } from '../../test/render';
import { ActionRequiredPage } from './ActionRequiredPage';

vi.mock('../../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../lib/api')>();
  return { ...mod, api: { ...mod.api, getActionRequired: vi.fn() } };
});

const action = (sequence: number, blockedBySequence: number | null): InstallmentAction => ({
  installmentId: `I${sequence}`,
  loanId: 'L1',
  customerId: 'C1',
  customerName: 'Priya',
  customerNumber: 'C0001',
  sequence,
  dueDate: '2026-09-20',
  amountDue: 1000,
  paidAmount: 0,
  remaining: 1000,
  daysPastDue: 10,
  graceDays: 2,
  kind: 'DEFAULT',
  frequency: 'DAILY',
  blockedBySequence,
});

describe('ActionRequiredPage (#5)', () => {
  it('only lets the oldest installment of a loan be collected', async () => {
    vi.mocked(api.getActionRequired).mockResolvedValue({
      installmentActions: [action(1, null), action(2, 1)],
      loanActions: [],
      total: 2,
    });
    renderPage(<ActionRequiredPage />, { route: '/action-required' });
    const buttons = await screen.findAllByRole('button', { name: 'Collect' });
    expect(buttons[0]).toBeEnabled();
    expect(buttons[1]).toBeDisabled();
    expect(buttons[1]).toHaveAttribute('title', 'Collect installment #1 first');
  });
});
