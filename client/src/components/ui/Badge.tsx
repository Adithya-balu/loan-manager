import type { ReactNode } from 'react';
import type { InstallmentStatus, LoanStatus, RiskResult } from '../../lib/types';
import { LOAN_STATUS_TONE, RISK_TONE, STATUS_TONE } from '../../lib/format';
import { useI18n } from '../../i18n/I18nContext';

type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'indigo';

const TONE_CLASSES: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  blue: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  red: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300',
  indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
};

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: InstallmentStatus }) {
  const { t } = useI18n();
  return <Badge tone={STATUS_TONE[status]}>{t(`instStatus.${status}`)}</Badge>;
}

export function LoanStatusBadge({ status }: { status: LoanStatus }) {
  const { t } = useI18n();
  return <Badge tone={LOAN_STATUS_TONE[status]}>{t(`loanStatus.${status}`)}</Badge>;
}

export function RiskBadge({ risk }: { risk: RiskResult }) {
  const { t } = useI18n();
  const label = risk.score === null ? t('risk.noHistory') : `${t(`risk.${risk.band}`)} · ${risk.score}`;
  return <Badge tone={RISK_TONE[risk.band]}>{label}</Badge>;
}
