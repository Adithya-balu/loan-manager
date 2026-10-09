import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { LANGUAGES, useI18n, type Lang } from '../i18n/I18nContext';
import type { MessageKey } from '../i18n/en';

interface NavItem {
  to: string;
  label: MessageKey;
  icon: string;
  end?: boolean;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'nav.dashboard', icon: '▚', end: true },
  { to: '/customers', label: 'nav.customers', icon: '☰' },
  { to: '/loans', label: 'nav.loans', icon: '₹' },
  { to: '/repayments', label: 'nav.repayments', icon: '⇅' },
  { to: '/collections/today', label: 'nav.todayCollection', icon: '◷' },
  { to: '/action-required', label: 'nav.actionRequired', icon: '!' },
  { to: '/reports', label: 'nav.reports', icon: '▤' },
  { to: '/company', label: 'nav.company', icon: '🏢', adminOnly: true },
  { to: '/settings', label: 'nav.settings', icon: '⚙', adminOnly: true },
];

export function Layout() {
  const { data: actions } = useApi(() => api.getActionRequired(), []);
  const { data: company, reload: reloadCompany } = useApi(() => api.getCompany(), []);
  const actionCount = actions?.total ?? 0;
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang, t } = useI18n();
  const navigate = useNavigate();

  // CompanyProfilePage dispatches this after a save or logo upload.
  useEffect(() => {
    window.addEventListener('company:updated', reloadCompany);
    return () => window.removeEventListener('company:updated', reloadCompany);
  }, [reloadCompany]);

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="px-5 py-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-indigo-600 text-sm font-bold text-white">
              {company?.logoUrl ? (
                <img src={company.logoUrl} alt="Logo" className="h-full w-full object-cover" />
              ) : (
                'LM'
              )}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {company?.name ?? t('login.title')}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{t('layout.tagline')}</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.filter((item) => !item.adminOnly || user?.role === 'ADMIN').map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
                }`
              }
            >
              <span className="flex items-center gap-2.5">
                <span className="w-4 text-center text-slate-400 dark:text-slate-500">{item.icon}</span>
                {t(item.label)}
              </span>
              {item.to === '/action-required' && actionCount > 0 && (
                <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {actionCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 px-5 py-4 text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
          <div className="mb-3 flex items-center justify-between">
            <NavLink
              to="/account"
              className="group flex-1 rounded-lg -mx-1 px-1 py-1 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <p className="font-medium text-slate-600 group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-white">
                {user?.name}
              </p>
              <p>{user?.role === 'ADMIN' ? t('layout.administrator') : t('layout.agent')}</p>
            </NavLink>
            <button
              onClick={onLogout}
              className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
            >
              {t('layout.logout')}
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              aria-label={t('layout.language')}
              className="rounded-lg border-0 bg-transparent py-1 pl-1 pr-6 text-xs font-medium text-slate-500 hover:bg-slate-100 focus:ring-0 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <button
              onClick={toggleTheme}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
              aria-label={t('layout.toggleTheme')}
            >
              {theme === 'dark' ? t('layout.lightTheme') : t('layout.darkTheme')}
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
