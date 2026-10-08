import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

// text-base below sm keeps iOS Safari from zooming into focused fields.
const controlClass =
  'block min-w-0 rounded-lg border border-border-strong bg-field px-3 text-base text-fg shadow-sm transition-colors placeholder:text-fg-subtle focus:border-primary focus:ring-2 focus:ring-primary/25 focus:outline-none disabled:opacity-60 aria-invalid:border-danger aria-invalid:focus:ring-danger/25 sm:text-sm';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(controlClass, 'w-full py-2', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(controlClass, 'w-full resize-y py-2', className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(controlClass, 'py-1.5 pr-8', className)} {...props} />;
}

interface FieldProps {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Label, control and helper text stacked with consistent spacing. */
export function Field({ label, htmlFor, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-fg">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : (
        hint && <p className="text-xs text-fg-subtle">{hint}</p>
      )}
    </div>
  );
}
