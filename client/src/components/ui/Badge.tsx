import type { ReactNode } from 'react';
import type { InstallmentStatus, LoanStatus, RiskResult } from '../../lib/types';
import { LOAN_STATUS_TONE, RISK_TONE, STATUS_TONE } from '../../lib/format';

type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'indigo';

const TONE_CLASSES: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-600',
  blue: 'bg-sky-100 text-sky-700',
  green: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-rose-100 text-rose-700',
  indigo: 'bg-indigo-100 text-indigo-700',
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
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>;
}

export function LoanStatusBadge({ status }: { status: LoanStatus }) {
  return <Badge tone={LOAN_STATUS_TONE[status]}>{status}</Badge>;
}

export function RiskBadge({ risk }: { risk: RiskResult }) {
  const label = risk.score === null ? 'No history' : `${risk.band} · ${risk.score}`;
  return <Badge tone={RISK_TONE[risk.band]}>{label}</Badge>;
}
