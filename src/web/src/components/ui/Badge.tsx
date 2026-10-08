import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/locales/en';

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
const MESSAGE_STATUS: Record<string, { tone: Tone; label: MessageKey }> = {
  pending: { tone: 'warning', label: 'status.pending' },
  sending: { tone: 'primary', label: 'status.sending' },
  sent: { tone: 'success', label: 'status.sent' },
  failed: { tone: 'danger', label: 'status.failed' },
  received: { tone: 'primary', label: 'status.unread' },
  read: { tone: 'neutral', label: 'status.read' },
};

export function MessageStatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const known = MESSAGE_STATUS[status];
  return (
    <Badge tone={known?.tone ?? 'neutral'} dot>
      {known ? t(known.label) : status}
    </Badge>
  );
}

export function DirectionBadge({ direction }: { direction: string }) {
  const { t } = useI18n();
  return direction === 'inbound' ? (
    <Badge tone="primary">{t('direction.in')}</Badge>
  ) : (
    <Badge tone="neutral">{t('direction.out')}</Badge>
  );
}
