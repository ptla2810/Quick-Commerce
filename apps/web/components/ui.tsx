'use client';

import Link from 'next/link';
import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@padosi/shared';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'navy';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50',
  secondary: 'bg-white text-navy-800 ring-1 ring-inset ring-navy-100 hover:bg-navy-50 disabled:text-navy-800/50',
  ghost: 'text-navy-800 hover:bg-navy-50',
  danger: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-red-700/50',
  accent: 'bg-accent-500 text-navy-900 hover:bg-accent-500/90',
  navy: 'bg-navy-800 text-white hover:bg-navy-900',
};
const sizes = { sm: 'h-9 px-3 text-sm', md: 'h-11 px-4 text-sm', lg: 'h-12 px-5 text-base' };

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: keyof typeof sizes;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'primary', size = 'md', loading, block, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      className={cx('inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed', variants[variant], sizes[size], block && 'w-full', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function LinkButton({ href, variant = 'primary', size = 'md', className, children, block }: { href: string; variant?: Variant; size?: keyof typeof sizes; className?: string; children: ReactNode; block?: boolean }) {
  return (
    <Link href={href} className={cx('inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors', variants[variant], sizes[size], block && 'w-full', className)}>
      {children}
    </Link>
  );
}

export function Card({ className, children, as: As = 'div', label }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'article' | 'li'; label?: string }) {
  return (
    <As aria-label={label} className={cx('rounded-2xl bg-white p-4 shadow-sm ring-1 ring-navy-100/70', className)}>
      {children}
    </As>
  );
}

type Tone = 'green' | 'navy' | 'orange' | 'red' | 'gray' | 'blue';
const tones: Record<Tone, string> = {
  green: 'bg-brand-50 text-brand-700 ring-brand-100',
  navy: 'bg-navy-50 text-navy-800 ring-navy-100',
  orange: 'bg-accent-50 text-accent-700 ring-accent-100',
  red: 'bg-red-50 text-red-800 ring-red-200',
  gray: 'bg-gray-100 text-gray-700 ring-gray-200',
  blue: 'bg-sky-50 text-sky-800 ring-sky-200',
};
export function Badge({ tone = 'navy', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', tones[tone], className)}>{children}</span>;
}

export function DemoBadge({ label = 'Demo' }: { label?: string }) {
  return (
    <Badge tone="orange" className="uppercase tracking-wide">
      {label}
    </Badge>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  AWAITING_RX_REVIEW: 'orange',
  PENDING_PAYMENT: 'orange',
  PLACED: 'blue',
  ACCEPTED: 'blue',
  PREPARING: 'blue',
  READY_FOR_PICKUP: 'blue',
  OUT_FOR_DELIVERY: 'green',
  DELIVERY_FAILED: 'red',
  DELIVERED: 'green',
  CANCELLED: 'gray',
  REJECTED: 'red',
};
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'navy'}>{ORDER_STATUS_LABELS[status as OrderStatus] ?? status.replace(/_/g, ' ').toLowerCase()}</Badge>;
}

export function VerificationBadge({ status }: { status: string }) {
  const tone: Tone = status === 'APPROVED' ? 'green' : status === 'REJECTED' ? 'red' : status === 'INFO_REQUIRED' ? 'orange' : 'gray';
  const label = status === 'INFO_REQUIRED' ? 'More info needed' : status.charAt(0) + status.slice(1).toLowerCase().replace('_', ' ');
  return <Badge tone={tone}>{label}</Badge>;
}

interface FieldProps {
  label: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
}

function FieldWrap({ id, label, error, hint, required, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-navy-800">
        {label}
        {required && <span className="text-red-700"> *</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-navy-700/70">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-xs font-medium text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls = (err?: string | null) =>
  cx('block w-full rounded-xl border-0 bg-white px-3 py-2.5 text-base text-navy-900 ring-1 ring-inset placeholder:text-navy-700/40 focus:ring-2 focus:ring-brand-500 sm:text-sm', err ? 'ring-red-400' : 'ring-navy-100');

export function Input({ label, error, hint, required, className, ...rest }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <FieldWrap id={id} label={label} error={error} hint={hint} required={required}>
      <input id={id} required={required} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} className={cx(inputCls(error), className)} {...rest} />
    </FieldWrap>
  );
}

export function Textarea({ label, error, hint, required, ...rest }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldWrap id={id} label={label} error={error} hint={hint} required={required}>
      <textarea id={id} required={required} aria-invalid={!!error} className={inputCls(error)} rows={3} {...rest} />
    </FieldWrap>
  );
}

export function Select({ label, error, hint, required, children, ...rest }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <FieldWrap id={id} label={label} error={error} hint={hint} required={required}>
      <select id={id} required={required} aria-invalid={!!error} className={inputCls(error)} {...rest}>
        {children}
      </select>
    </FieldWrap>
  );
}

export function Checkbox({ label, checked, onChange, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 rounded border-navy-100 text-brand-600 focus:ring-brand-500" />
      <label htmlFor={id} className="text-sm text-navy-800">
        {label}
        {hint && <span className="block text-xs text-navy-700/70">{hint}</span>}
      </label>
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-navy-700">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-navy-100/60', className)} aria-hidden />;
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-navy-100/70">
      {icon && <div className="text-4xl" aria-hidden>{icon}</div>}
      <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
      {body && <p className="max-w-sm text-sm text-navy-700/80">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: { message: string } | null; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl bg-red-50 px-6 py-10 text-center ring-1 ring-red-200">
      <AlertTriangle className="h-8 w-8 text-red-700" aria-hidden />
      <p className="text-sm font-medium text-red-800">{error?.message ?? 'Something went wrong'}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Notice({ tone = 'navy', title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-xl px-4 py-3 text-sm ring-1 ring-inset', tones[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? 'mt-0.5' : ''}>{children}</div>
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl p-0 shadow-xl backdrop:bg-navy-900/50" aria-label={title}>
      <div className="flex items-center justify-between border-b border-navy-100 px-5 py-4">
        <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
        <button onClick={onClose} className="rounded-lg p-2 hover:bg-navy-50" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
    </dialog>
  );
}

export function SectionHeader({ title, action, subtitle }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-navy-900">{title}</h2>
        {subtitle && <p className="text-sm text-navy-700/70">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageTitle({ title, subtitle, action, back }: { title: string; subtitle?: ReactNode; action?: ReactNode; back?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        {back && (
          <Link href={back} className="mb-1 inline-block text-sm font-medium text-brand-700 hover:underline">
            ← Back
          </Link>
        )}
        <h1 className="text-2xl font-bold text-navy-900">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-navy-700/80">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'green' | 'red' }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-navy-700/70">{label}</p>
      <p className={cx('mt-1 text-2xl font-bold tabular-nums', tone === 'green' ? 'text-brand-700' : tone === 'red' ? 'text-red-700' : 'text-navy-900')}>{value}</p>
      {hint && <p className="mt-1 text-xs text-navy-700/70">{hint}</p>}
    </Card>
  );
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('h-10 shrink-0 rounded-full px-4 text-sm font-semibold ring-1 ring-inset', value === o.value ? 'bg-navy-800 text-white ring-navy-800' : 'bg-white text-navy-800 ring-navy-100 hover:bg-navy-50')}
        >
          {o.label}
          {o.count != null && <span className="ml-1.5 opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
