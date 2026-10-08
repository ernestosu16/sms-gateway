import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n';
import { Button } from './Button';
import { AlertIcon } from './icons';

interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  /** danger for destructive actions, warning for uncertain ones, primary otherwise. */
  tone?: 'danger' | 'warning' | 'primary';
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/**
 * Promise-based replacement for window.confirm: `await confirm({...})`
 * resolves true or false once the user answers. Render `dialog` once in the
 * component that calls it.
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );

  const settle = (confirmed: boolean) => {
    pending?.resolve(confirmed);
    setPending(null);
  };

  const dialog = pending && <ConfirmDialog {...pending} onSettle={settle} />;

  return { confirm, dialog };
}

interface ConfirmDialogProps extends ConfirmOptions {
  onSettle: (confirmed: boolean) => void;
}

/**
 * Modal built on <dialog>: showModal() gives focus trapping, Escape and an
 * inert page behind it without any custom handling.
 */
function ConfirmDialog({
  title,
  description,
  confirmLabel,
  tone = 'danger',
  onSettle,
}: ConfirmDialogProps) {
  const ref = useRef<ComponentRef<'dialog'>>(null);
  const { t } = useI18n();

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-dialog-title"
      // Escape fires cancel; settle through state instead of letting the
      // browser close the dialog behind React's back.
      onCancel={(e) => {
        e.preventDefault();
        onSettle(false);
      }}
      // The content fills the dialog box, so a click whose target is the
      // dialog itself landed on the backdrop.
      onClick={(e) => {
        if (e.target === e.currentTarget) onSettle(false);
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-xl border border-border bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex gap-4 p-5 sm:p-6">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            tone === 'danger' && 'bg-danger-soft text-danger-soft-fg',
            tone === 'warning' && 'bg-warning-soft text-warning-soft-fg',
            tone === 'primary' && 'bg-primary-soft text-primary-soft-fg',
          )}
        >
          <AlertIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 pt-1.5">
          <h2 id="confirm-dialog-title" className="text-base font-semibold text-fg">
            {title}
          </h2>
          {description && <div className="mt-1.5 text-sm text-fg-muted">{description}</div>}
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-border bg-surface-muted px-5 py-3 sm:flex-row sm:justify-end sm:px-6">
        <Button variant="secondary" onClick={() => onSettle(false)} autoFocus>
          {t('common.cancel')}
        </Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={() => onSettle(true)}>
          {confirmLabel ?? t('common.confirm')}
        </Button>
      </div>
    </dialog>
  );
}
