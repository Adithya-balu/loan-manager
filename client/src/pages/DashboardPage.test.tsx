import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import type { DashboardResponse } from '../lib/types';
import { renderPage } from '../test/render';
import { DashboardPage } from './DashboardPage';

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: { ...mod.api, getDashboard: vi.fn() } };
});

const dashboard: DashboardResponse = {
  kpis: {
    totalDisbursed: 100000, outstanding: 40000, interestEarned: 5000, overdueAmount: 2000,
    defaultedBalance: 7500, activeLoans: 4, closedLoans: 2, defaultedLoans: 1,
    totalCustomers: 5, collectionEfficiency: 92,
  },
  collections: { today: 0, week: 0, month: 0 },
  portfolio: { DAILY: { count: 1, outstanding: 1 }, WEEKLY: { count: 1, outstanding: 1 }, MONTHLY: { count: 1, outstanding: 1 } },
  trend: [],
  actionRequiredCount: 0,
  topRisk: [],
};

describe('DashboardPage (#9)', () => {
  it('shows the defaulted balance separately from outstanding', async () => {
    vi.mocked(api.getDashboard).mockResolvedValue(dashboard);
    renderPage(<DashboardPage />);
    const card = (await screen.findByText('Defaulted Balance')).parentElement!;
    expect(card).toHaveTextContent('₹7,500.00');
    expect(screen.getByText('Outstanding').parentElement).toHaveTextContent('₹40,000.00');
  });
});
