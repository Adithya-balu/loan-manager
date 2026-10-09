import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { loanDetail, payment } from '../../test/fixtures';
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

describe('LoanDetailPage — settled loans (#2)', () => {
  const settledLoan = () =>
    loanDetail({
      status: 'CLOSED',
      payments: [
        payment({ id: 'S1', kind: 'SETTLEMENT', installmentId: null, installment: null, amount: 2500 }),
        payment({ id: 'P1', amount: 500 }),
      ],
    });

  it('offers only "Undo settlement" on the settlement payment', async () => {
    await show(settledLoan());
    const rows = screen.getAllByRole('row');
    const settlementRow = rows.find((r) => within(r).queryByText('Settlement'))!;
    expect(within(settlementRow).getByRole('button', { name: 'Undo settlement' })).toBeInTheDocument();
    expect(within(settlementRow).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('locks the regular payments of a settled loan', async () => {
    await show(settledLoan());
    const paymentsCard = screen.getByText('Payments').closest<HTMLElement>('div.rounded-xl')!;
    expect(within(paymentsCard).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(within(paymentsCard).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.getByText('Locked — loan was settled')).toBeInTheDocument();
  });

  it('keeps Edit/Delete on payments of an unsettled loan', async () => {
    await show(loanDetail({ payments: [payment()] }));
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });
});

describe('LoanDetailPage — non-active loans (#7)', () => {
  it('hides Capitalize/Default, Collect and Edit on a DEFAULTED loan', async () => {
    await show(loanDetail({ status: 'DEFAULTED' }));
    expect(screen.queryByRole('button', { name: /Capitalize|^Default$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collect' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('shows Default on an overdue installment of an ACTIVE loan', async () => {
    await show();
    expect(screen.getByRole('button', { name: 'Default' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });
});

describe('LoanDetailPage — interest/principal split (#2)', () => {
  it('shows how collections split and how much principal is still owed', async () => {
    const base = loanDetail();
    await show(loanDetail({ rollup: { ...base.rollup, totalPaid: 1250, interestCollected: 200, principalCollected: 1050, outstandingPrincipal: 1950 } }));
    expect(screen.getByText('Collected').parentElement).toHaveTextContent('₹200.00 interest · ₹1,050.00 principal');
    expect(screen.getByText('Outstanding').parentElement).toHaveTextContent('Principal ₹1,950.00');
  });
});
