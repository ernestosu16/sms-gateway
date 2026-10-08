import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  /** Accessible name and tooltip. */
  label: string;
  /** What the button shows; defaults to the label. */
  content?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Row of mutually exclusive toggle buttons, styled with the surface tokens. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-muted p-0.5',
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          aria-label={option.label}
          title={option.label}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
            value === option.value
              ? 'bg-surface text-fg shadow-sm'
              : 'text-fg-subtle hover:text-fg',
          )}
        >
          {option.content ?? option.label}
        </button>
      ))}
    </div>
  );
}
