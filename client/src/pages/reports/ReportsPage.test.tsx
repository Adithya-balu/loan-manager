import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import type { LoanDetail } from '../../lib/types';
import { loanDetail, loanListItem } from '../../test/fixtures';
import { renderPage } from '../../test/render';
import { ReportsPage } from './ReportsPage';

vi.mock('../../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../lib/api')>();
  return { ...mod, api: { ...mod.api, listLoans: vi.fn(), getLoan: vi.fn(), listPayments: vi.fn() } };
});

const open = async (tab: string) => {
  vi.mocked(api.listPayments).mockResolvedValue([]);
  renderPage(<ReportsPage />, { route: '/reports' });
  await userEvent.click(screen.getByRole('button', { name: tab }));
};

describe('Outstanding report (#13)', () => {
  it('counts only ACTIVE loans as open', async () => {
    vi.mocked(api.listLoans).mockResolvedValue([
      loanListItem('A', 'DAILY', 'ACTIVE'),
      loanListItem('B', 'DAILY', 'DEFAULTED'),
      loanListItem('C', 'DAILY', 'CLOSED'),
    ]);
    await open('Outstanding');
    expect(await screen.findByText('Borrower A')).toBeInTheDocument();
    expect(screen.queryByText('Borrower B')).not.toBeInTheDocument();
    expect(screen.getByText('Open Loans').nextElementSibling).toHaveTextContent('1');
  });
});

describe('Customer statement (#12)', () => {
  it('shows an error when the statement fails to load', async () => {
    vi.mocked(api.listLoans).mockResolvedValue([loanListItem('A', 'DAILY')]);
    vi.mocked(api.getLoan).mockRejectedValue(new Error('Server unavailable'));
    await open('Customer Statement');
    await userEvent.selectOptions(await screen.findByLabelText('Loan'), 'A');
    expect(await screen.findByText('Server unavailable')).toBeInTheDocument();
  });

  it('ignores a slower response for a previously selected loan', async () => {
    vi.mocked(api.listLoans).mockResolvedValue([loanListItem('A', 'DAILY'), loanListItem('B', 'WEEKLY')]);
    let resolveA!: (d: LoanDetail) => void;
    vi.mocked(api.getLoan).mockImplementation((id: string) =>
      id === 'A'
        ? new Promise<LoanDetail>((r) => (resolveA = r))
        : Promise.resolve(loanDetail({ id: 'B', principal: 2222 })),
    );
    await open('Customer Statement');
    const select = await screen.findByLabelText('Loan');
    await userEvent.selectOptions(select, 'A');
    await userEvent.selectOptions(select, 'B');
    expect(await screen.findByText('₹2,222.00')).toBeInTheDocument();
    await act(async () => resolveA(loanDetail({ id: 'A', principal: 1111 })));
    expect(screen.queryByText('₹1,111.00')).not.toBeInTheDocument();
    expect(screen.getByText('₹2,222.00')).toBeInTheDocument();
  });
});
