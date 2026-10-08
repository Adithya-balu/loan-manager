import type { ReactNode } from 'react';

const ALIGN: Record<'left' | 'right' | 'center', string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-slate-50 dark:bg-slate-800/80">{children}</thead>;
}

export function TH({
  children,
  align = 'left',
}: {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 ${ALIGN[align]}`}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100 dark:divide-slate-700">{children}</tbody>;
}

export function TR({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={
        onClick
          ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50'
          : 'hover:bg-slate-50/50 dark:hover:bg-slate-700/30'
      }
    >
      {children}
    </tr>
  );
}

export function TD({
  children,
  align = 'left',
  className = '',
}: {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  return (
    <td className={`px-4 py-2.5 text-slate-700 dark:text-slate-200 ${ALIGN[align]} ${className}`}>
      {children}
    </td>
  );
}
