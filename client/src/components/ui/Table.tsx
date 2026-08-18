import type { ReactNode } from 'react';

const ALIGN: Record<'left' | 'right' | 'center', string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-slate-50">{children}</thead>;
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
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${ALIGN[align]}`}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
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
      className={onClick ? 'cursor-pointer hover:bg-slate-50' : 'hover:bg-slate-50/50'}
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
  return <td className={`px-4 py-2.5 text-slate-700 ${ALIGN[align]} ${className}`}>{children}</td>;
}
