import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../lib/api';
import { useI18n } from '../../i18n/I18nContext';

export function LoginPage() {
  const { login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('login.failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-900">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-base font-bold text-white">
            LM
          </span>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t('login.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('login.subtitle')}</p>
        </div>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <Field label={t('login.email')} htmlFor="email" required>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label={t('login.password')} htmlFor="password" required>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <Button type="submit" disabled={submitting} className="mt-1 w-full">
            {submitting ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>
      </div>
    </div>
  );
}
