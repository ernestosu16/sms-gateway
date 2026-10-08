import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { AlertIcon, CheckCircleIcon, InfoIcon } from './icons';

const tones = {
  danger: { className: 'border-danger/30 bg-danger-soft text-danger-soft-fg', Icon: AlertIcon },
  success: {
    className: 'border-success/30 bg-success-soft text-success-soft-fg',
    Icon: CheckCircleIcon,
  },
  warning: { className: 'border-warning/30 bg-warning-soft text-warning-soft-fg', Icon: AlertIcon },
  info: { className: 'border-primary/30 bg-primary-soft text-primary-soft-fg', Icon: InfoIcon },
} as const;

interface AlertProps {
  tone?: keyof typeof tones;
  className?: string;
  children: ReactNode;
}

export function Alert({ tone = 'danger', className, children }: AlertProps) {
  const { className: toneClass, Icon } = tones[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm', toneClass, className)}
    >
      <Icon className="mt-px h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  );
}
