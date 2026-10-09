import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import type { CustomerDetail } from '../../lib/types';
import { customer, loanListItem } from '../../test/fixtures';
import { renderPage } from '../../test/render';
import { CustomerDetailPage } from './CustomerDetailPage';

vi.mock('../../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../lib/api')>();
  return { ...mod, api: { ...mod.api, getCustomer: vi.fn() } };
});

const detail = (loans: CustomerDetail['loans']): CustomerDetail =>
  ({
    customer,
    risk: { score: null, band: 'UNKNOWN' },
    loans,
    payments: [],
    totals: { disbursed: 0, outstanding: 0, collected: 0, overdue: 0 },
  }) as unknown as CustomerDetail;

const show = async (d: CustomerDetail) => {
  vi.mocked(api.getCustomer).mockResolvedValue(d);
  renderPage(<CustomerDetailPage />, { route: '/customers/:id', path: '/customers/C1' });
  return screen.findAllByText('Priya');
};

describe('CustomerDetailPage delete (decision C)', () => {
  it('disables Delete when the customer has loans, explaining why', async () => {
    await show(detail([loanListItem('L1', 'DAILY')] as unknown as CustomerDetail['loans']));
    const del = screen.getByRole('button', { name: 'Delete' });
    expect(del).toBeDisabled();
    expect(del).toHaveAttribute('title', expect.stringMatching(/Delete their loans first/));
  });

  it('allows Delete for a customer without loans', async () => {
    await show(detail([]));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });
});
