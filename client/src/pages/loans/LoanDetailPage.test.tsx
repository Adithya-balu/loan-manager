import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { loanDetail } from '../../test/fixtures';
import { renderPage } from '../../test/render';
import { LoanDetailPage } from './LoanDetailPage';

vi.mock('../../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../lib/api')>();
  return { ...mod, api: { ...mod.api, getLoan: vi.fn() } };
});

const show = async (loan = loanDetail()) => {
  vi.mocked(api.getLoan).mockResolvedValue(loan);
  renderPage(<LoanDetailPage />, { route: '/loans/:id', path: '/loans/L1' });
  return screen.findByText('Repayment Schedule');
};

const scheduleCard = () => screen.getByText('Repayment Schedule').closest<HTMLElement>('div.rounded-xl')!;

beforeEach(() => vi.mocked(api.getLoan).mockReset());

describe('LoanDetailPage — collection order', () => {
  it('enables Collect only on the oldest open installment', async () => {
    await show();
    const buttons = screen.getAllByRole('button', { name: 'Collect' });
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toBeEnabled();
    expect(buttons[1]).toBeDisabled();
    expect(buttons[1]).toHaveAttribute('title', 'Collect installment #1 first');
  });
});

describe('LoanDetailPage — settlement button', () => {
  it('sits on the schedule card for active loans', async () => {
    await show();
    expect(within(scheduleCard()).getByRole('button', { name: 'Pre-close / Settle' })).toBeInTheDocument();
  });

  it('is hidden for closed loans', async () => {
    await show(loanDetail({ status: 'CLOSED' }));
    expect(screen.queryByRole('button', { name: 'Pre-close / Settle' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collect' })).not.toBeInTheDocument();
  });
});
