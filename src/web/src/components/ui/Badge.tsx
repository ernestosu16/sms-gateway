import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const tones = {
  neutral: 'bg-neutral-soft text-neutral-soft-fg',
  primary: 'bg-primary-soft text-primary-soft-fg',
  success: 'bg-success-soft text-success-soft-fg',
  warning: 'bg-warning-soft text-warning-soft-fg',
  danger: 'bg-danger-soft text-danger-soft-fg',
  accent: 'bg-accent-soft text-accent-soft-fg',
} as const;

export type Tone = keyof typeof tones;

interface BadgeProps {
  tone?: Tone;
  /** Leading status dot, for states rather than labels. */
  dot?: boolean;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', dot = false, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

// Every message status the server emits, in one place for all views.
const MESSAGE_STATUS: Record<string, { tone: Tone; label: string }> = {
  pending: { tone: 'warning', label: 'Pending' },
  sending: { tone: 'primary', label: 'Sending' },
  sent: { tone: 'success', label: 'Sent' },
  failed: { tone: 'danger', label: 'Failed' },
  received: { tone: 'primary', label: 'Unread' },
  read: { tone: 'neutral', label: 'Read' },
};

export function MessageStatusBadge({ status }: { status: string }) {
  const { tone, label } = MESSAGE_STATUS[status] ?? { tone: 'neutral', label: status };
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}

export function DirectionBadge({ direction }: { direction: string }) {
  return direction === 'inbound' ? (
    <Badge tone="primary">IN</Badge>
  ) : (
    <Badge tone="neutral">OUT</Badge>
  );
}
