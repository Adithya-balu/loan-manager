import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSchedule } from '@loan/shared';
import { api } from '../../lib/api';
import type { CustomerListItem } from '../../lib/types';
import { loanDetail } from '../../test/fixtures';
import { renderPage } from '../../test/render';
import { LoanFormPage } from './LoanFormPage';

vi.mock('../../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../lib/api')>();
  return {
    ...mod,
    api: { ...mod.api, listCustomers: vi.fn(), previewSchedule: vi.fn(), createLoan: vi.fn(), getLoan: vi.fn(), updateLoan: vi.fn() },
  };
});

const customers = [
  { id: 'C1', customerNumber: 'C0001', name: 'Priya', mobile: '9000000001', risk: { score: 90, band: 'LOW' } },
] as unknown as CustomerListItem[];

beforeEach(() => {
  vi.mocked(api.listCustomers).mockResolvedValue(customers);
  // Preview with the real finance engine, as the server does.
  vi.mocked(api.previewSchedule).mockImplementation(async (b) =>
    generateSchedule({ ...b, startDate: b.repaymentStartDate, method: b.interestMethod }),
  );
  vi.mocked(api.createLoan).mockResolvedValue({ id: 'L9' } as never);
});

const field = (label: RegExp) => screen.getByLabelText(label);
/** Value shown under a preview summary label, once the debounced preview has loaded. */
const stat = async (label: string) =>
  (await screen.findByText(label, {}, { timeout: 2000 })).nextElementSibling?.textContent;

async function fillTerms() {
  const user = userEvent.setup();
  await user.selectOptions(await screen.findByDisplayValue('Select a customer…'), 'C1');
  await user.type(field(/^Principal/), '100000');
  await user.type(field(/^Annual Rate/), '12');
  await user.selectOptions(field(/^Repayment Frequency/), 'MONTHLY');
  await user.selectOptions(field(/^Interest Method/), 'REDUCING');
  await user.clear(field(/^No. of Installments/));
  await user.type(field(/^No. of Installments/), '12');
  return user;
}

describe('LoanFormPage — new loan', () => {
  it('previews the EMI schedule live from the entered terms', async () => {
    renderPage(<LoanFormPage />, { route: '/loans/new' });
    await fillTerms();
    expect(await stat('Per Installment')).toBe('₹8,884.88');
    expect(await stat('Total Interest')).toBe('₹6,618.55');
    expect(await stat('Total Payable')).toBe('₹1,06,618.55');
    expect(screen.getAllByRole('row')).toHaveLength(13); // header + 12 installments
  });

  it('submits numeric terms and leaves the guarantor out unless added', async () => {
    renderPage(<LoanFormPage />, { route: '/loans/new' });
    expect(screen.getByText('Add guarantor details')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Guarantor Name/)).not.toBeInTheDocument();

    const user = await fillTerms();
    await stat('Per Installment');
    await user.click(screen.getByRole('button', { name: 'Create Loan' }));

    expect(api.createLoan).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'C1', principal: 100000, annualRatePct: 12, frequency: 'MONTHLY',
        interestMethod: 'REDUCING', installments: 12, guarantorName: null,
        graceDaysOverride: null, defaultThresholdDaysOverride: null,
      }),
    );
    expect(await screen.findByText('navigated away')).toBeInTheDocument();
  });

  it('blocks a fractional grace-days override before submitting', async () => {
    renderPage(<LoanFormPage />, { route: '/loans/new' });
    const user = await fillTerms();
    const grace = field(/^Grace Days Override/) as HTMLInputElement;
    await user.type(grace, '2.5');
    await stat('Per Installment');
    await user.click(screen.getByRole('button', { name: 'Create Loan' }));
    // The number input (step 1) fails native validation, so the form never submits.
    expect(grace.validity.stepMismatch).toBe(true);
    expect(api.createLoan).not.toHaveBeenCalled();
  });
});

describe('LoanFormPage — editing', () => {
  it('opens the guarantor section when the loan already has one', async () => {
    vi.mocked(api.getLoan).mockResolvedValue(loanDetail({ guarantorName: 'Ravi', guarantorRelation: 'Brother' }));
    renderPage(<LoanFormPage />, { route: '/loans/:id/edit', path: '/loans/L1/edit' });
    expect(await screen.findByDisplayValue('Ravi')).toBeInTheDocument();
    expect(screen.getByText('Guarantor (optional)')).toBeInTheDocument();
  });

  it('locks the terms once the loan has payments', async () => {
    vi.mocked(api.getLoan).mockResolvedValue(
      loanDetail({ payments: [{ id: 'P1', loanId: 'L1', customerId: 'C1', amount: 10, date: '', mode: 'CASH', kind: 'REGULAR', createdAt: '' }] }),
    );
    renderPage(<LoanFormPage />, { route: '/loans/:id/edit', path: '/loans/L1/edit' });
    expect(await screen.findByText(/terms are locked/)).toBeInTheDocument();
    expect(field(/^Principal/)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
  });
});
