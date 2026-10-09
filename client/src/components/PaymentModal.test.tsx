import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { todayISO } from '../lib/format';
import { renderPage } from '../test/render';
import { PaymentModal } from './PaymentModal';
import { SettlementModal } from './SettlementModal';

const dateInput = () => document.querySelector<HTMLInputElement>('input[type="date"]')!;

describe('date pickers block future dates (#7)', () => {
  it('PaymentModal', () => {
    renderPage(<PaymentModal open loanId="L1" onClose={() => {}} onSuccess={() => {}} />);
    expect(dateInput()).toHaveAttribute('max', todayISO());
  });

  it('SettlementModal', () => {
    renderPage(<SettlementModal open loanId="L1" customerName="Priya" onClose={() => {}} onSuccess={() => {}} />);
    expect(dateInput()).toHaveAttribute('max', todayISO());
    expect(screen.getByText(/Pre-close/)).toBeInTheDocument();
  });
});
