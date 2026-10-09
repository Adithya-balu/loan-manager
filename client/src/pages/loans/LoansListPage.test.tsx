import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { loanListItem } from '../../test/fixtures';
import { renderPage } from '../../test/render';
import { LoansListPage } from './LoansListPage';

vi.mock('../../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../lib/api')>();
  return { ...mod, api: { ...mod.api, listLoans: vi.fn() } };
});

beforeEach(() => {
  vi.mocked(api.listLoans).mockResolvedValue([
    loanListItem('A', 'DAILY'),
    loanListItem('B', 'WEEKLY'),
    loanListItem('C', 'MONTHLY', 'CLOSED'),
  ]);
});

describe('LoansListPage', () => {
  it('filters by loan type', async () => {
    renderPage(<LoansListPage />, { route: '/loans' });
    expect(await screen.findByText('Borrower A')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByDisplayValue('All types'), 'WEEKLY');
    expect(screen.queryByText('Borrower A')).not.toBeInTheDocument();
    expect(screen.getByText('Borrower B')).toBeInTheDocument();
  });

  it('combines type and status filters', async () => {
    renderPage(<LoansListPage />, { route: '/loans' });
    await screen.findByText('Borrower A');
    await userEvent.selectOptions(screen.getByDisplayValue('All statuses'), 'CLOSED');
    await userEvent.selectOptions(screen.getByDisplayValue('All types'), 'DAILY');
    expect(screen.getByText('No loans found')).toBeInTheDocument();
  });
});
