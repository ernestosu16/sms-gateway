import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './States';

const variants = {
  primary: 'bg-primary text-primary-fg shadow-sm hover:bg-primary-hover',
  secondary: 'border border-border-strong bg-surface text-fg shadow-sm hover:bg-surface-hover',
  danger: 'bg-danger text-danger-fg shadow-sm hover:bg-danger-hover',
  'danger-soft': 'bg-danger-soft text-danger-soft-fg hover:bg-danger hover:text-danger-fg',
  ghost: 'text-fg-muted hover:bg-surface-hover hover:text-fg',
  link: 'text-primary hover:text-primary-hover hover:underline underline-offset-2',
} as const;

const sizes = {
  sm: 'h-8 gap-1.5 rounded-md px-2.5 text-xs',
  md: 'h-10 gap-2 rounded-lg px-4 text-sm',
  icon: 'h-9 w-9 rounded-lg',
} as const;

export type ButtonVariant = keyof typeof variants;

interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: keyof typeof sizes;
  /** Shows a spinner in place of the icon and blocks further clicks. */
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  type = 'button',
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors',
        'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        // Link buttons sit inline with text, so they take no box sizing.
        variant === 'link' ? 'gap-1 text-xs' : sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </button>
  );
}
