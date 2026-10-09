import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

const baseControl =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-indigo-900/40 dark:disabled:bg-slate-900 dark:disabled:text-slate-500';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
}) {
  // Link the label to its control so clicking it focuses the field and
  // screen readers announce it. A control nested in a wrapper (e.g. a select
  // beside a button) can pass `htmlFor` with its own id instead.
  const autoId = useId();
  let control = children;
  let id = htmlFor;
  if (!id && Children.count(children) === 1 && isValidElement(children) && isFormControl(children)) {
    const props = children.props as { id?: string };
    id = props.id ?? autoId;
    control = cloneElement(children as ReactElement<{ id?: string }>, { id });
  }
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-slate-600 dark:text-slate-300">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {control}
      {hint && !error && <p className="text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return <input className={`${baseControl} ${className}`} {...rest} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', children, ...rest } = props;
  return (
    <select className={`${baseControl} ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props;
  return <textarea className={`${baseControl} ${className}`} {...rest} />;
}

function isFormControl(el: ReactElement): boolean {
  return (
    el.type === Input ||
    el.type === Select ||
    el.type === TextArea ||
    el.type === 'input' ||
    el.type === 'select' ||
    el.type === 'textarea'
  );
}
