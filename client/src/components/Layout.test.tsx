import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DATA_CHANGED_EVENT, api } from '../lib/api';
import { AuthProvider } from '../context/AuthContext';
import { renderPage } from '../test/render';
import { Layout } from './Layout';

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return {
    ...mod,
    api: { ...mod.api, me: vi.fn(), getActionRequired: vi.fn(), getCompany: vi.fn() },
  };
});

beforeEach(() => {
  vi.mocked(api.me).mockResolvedValue({ id: 'U1', name: 'Admin', email: 'a@x.com', role: 'ADMIN' });
  vi.mocked(api.getCompany).mockResolvedValue({ id: 'default', name: 'Acme Finance', updatedAt: '' });
});

describe('Layout sidebar badge (#11)', () => {
  it('refreshes the Action Required count after a change', async () => {
    vi.mocked(api.getActionRequired)
      .mockResolvedValueOnce({ installmentActions: [], loanActions: [], total: 3 })
      .mockResolvedValue({ installmentActions: [], loanActions: [], total: 2 });
    renderPage(
      <AuthProvider>
        <Layout />
      </AuthProvider>,
    );
    expect(await screen.findByText('3')).toBeInTheDocument();
    await act(async () => window.dispatchEvent(new Event(DATA_CHANGED_EVENT)));
    expect(await screen.findByText('2')).toBeInTheDocument();
  });
});
