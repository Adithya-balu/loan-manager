import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: '▚', end: true },
  { to: '/customers', label: 'Customers', icon: '☰' },
  { to: '/loans', label: 'Loans', icon: '₹' },
  { to: '/repayments', label: 'Repayments', icon: '⇅' },
  { to: '/collections/today', label: "Today's Collection", icon: '◷' },
  { to: '/action-required', label: 'Action Required', icon: '!' },
  { to: '/settings', label: 'Settings', icon: '⚙', adminOnly: true },
];

export function Layout() {
  const { data: actions } = useApi(() => api.getActionRequired(), []);
  const actionCount = actions?.total ?? 0;
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              LM
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-800">Loan Manager</p>
              <p className="text-xs text-slate-400">Lending operations</p>
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
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <span className="flex items-center gap-2.5">
                <span className="w-4 text-center text-slate-400">{item.icon}</span>
                {item.label}
              </span>
              {item.to === '/action-required' && actionCount > 0 && (
                <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {actionCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 px-5 py-4 text-xs text-slate-400">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-600">{user?.name}</p>
              <p>{user?.role === 'ADMIN' ? 'Administrator' : 'Collection Agent'}</p>
            </div>
            <button
              onClick={onLogout}
              className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              Log out
            </button>
          </div>
          INR · en-IN
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

