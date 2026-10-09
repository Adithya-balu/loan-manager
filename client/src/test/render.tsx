import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { I18nProvider } from '../i18n/I18nContext';
import { ToastProvider } from '../components/ui/Toast';

/**
 * Render a page inside the app's providers at `path`, matched by `route`
 * (e.g. route="/loans/:id", path="/loans/L1"). Pages call the mocked `api`
 * module directly, so no AuthProvider is needed here.
 */
export function renderPage(ui: ReactElement, { route = '/', path }: { route?: string; path?: string } = {}) {
  return render(
    <MemoryRouter initialEntries={[path ?? route]}>
      <ThemeProvider>
        <I18nProvider>
          <ToastProvider>
            <Routes>
              <Route path={route} element={ui} />
              <Route path="*" element={<p>navigated away</p>} />
            </Routes>
          </ToastProvider>
        </I18nProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}
