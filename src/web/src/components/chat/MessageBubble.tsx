import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n';
import { formatDateTime, formatTime } from '@/lib/format';
import { linkify } from '@/lib/linkify';
import type { ThreadMessage } from '@/lib/useChat';
import type { MessageKey } from '@/locales/en';
import { AlertIcon, Button, CheckIcon, ClockIcon, CopyIcon, TrashIcon } from '@/components/ui';

interface MessageBubbleProps {
  message: ThreadMessage;
  /** First message of a run from the same side; gets more space above it. */
  startsGroup: boolean;
  highlighted: boolean;
  expanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
  onDelete: () => void;
  /** Omitted when the number cannot be sent to, which hides Retry. */
  onRetry?: () => void;
}

function StatusIndicator({ status }: { status: string }) {
  const { t } = useI18n();
  if (status === 'pending' || status === 'sending') {
    return (
      <span title={t('status.sending')} className="inline-flex">
        <ClockIcon className="h-3.5 w-3.5" />
        <span className="sr-only">{t('status.sending')}</span>
      </span>
    );
  }
  if (status === 'sent') {
    return (
      <span title={t('status.sent')} className="inline-flex">
        <CheckIcon className="h-3.5 w-3.5" />
        <span className="sr-only">{t('status.sent')}</span>
      </span>
    );
  }
  return null;
}

const STATUS_LABELS: Record<string, MessageKey> = {
  pending: 'status.pending',
  sending: 'status.sending',
  sent: 'status.sent',
  failed: 'status.failed',
  received: 'status.unread',
  read: 'status.read',
};

function statusLabel(status: string, t: (key: MessageKey) => string): string {
  const key = STATUS_LABELS[status];
  return key ? t(key) : status;
}

// Long enough to tell a single click from the start of a double click.
const DOUBLE_CLICK_MS = 250;

export default function MessageBubble({
  message,
  startsGroup,
  highlighted,
  expanded,
  onToggle,
  onCopy,
  onDelete,
  onRetry,
}: MessageBubbleProps) {
  const { t } = useI18n();
  const clickTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(clickTimer.current), []);
  const outbound = message.direction === 'outbound';
  const failed = message.status === 'failed';

  return (
    <div
      id={`msg-${message.id}`}
      className={cn(
        'flex flex-col',
        outbound ? 'items-end' : 'items-start',
        startsGroup ? 'mt-3' : 'mt-0.5',
      )}
    >
      {/* A div, not a button: browsers do not let users select text inside a
          button, and messages need to be selectable and copyable. */}
      <div
        onClick={(e) => {
          window.clearTimeout(clickTimer.current);
          // Following a link, or a double/triple click that selects text, must
          // not also toggle details. A single click waits out the double-click
          // window so a word selection does not open them first.
          if (e.target instanceof window.Element && e.target.closest('a')) return;
          if (e.detail > 1) return;
          clickTimer.current = window.setTimeout(() => {
            if (window.getSelection()?.isCollapsed ?? true) onToggle();
          }, DOUBLE_CLICK_MS);
        }}
        className={cn(
          'max-w-[85%] cursor-pointer rounded-2xl px-3.5 py-2 text-left text-sm shadow-sm transition select-text sm:max-w-[70%]',
          outbound ? 'rounded-br-md' : 'rounded-bl-md',
          outbound && !failed && 'bg-primary text-primary-fg',
          outbound && failed && 'bg-danger-soft text-fg ring-1 ring-danger',
          !outbound && 'border border-border bg-surface text-fg',
          highlighted && 'ring-2 ring-warning',
          message.pending && 'opacity-70',
        )}
      >
        <p className="break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
          {linkify(message.body).map((part, i) =>
            part.href ? (
              <a
                key={i}
                href={part.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={cn(
                  'underline underline-offset-2 hover:decoration-2',
                  outbound && !failed ? 'text-primary-fg' : 'text-primary',
                )}
              >
                {part.text}
              </a>
            ) : (
              part.text
            ),
          )}
        </p>
        {/* The timestamp doubles as the keyboard-reachable details toggle. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          aria-expanded={expanded}
          aria-label={t('bubble.details', { time: formatTime(message.created_at) })}
          className={cn(
            'mt-1 ml-auto flex items-center justify-end gap-1 rounded text-[11px] leading-none',
            'focus-visible:ring-2 focus-visible:ring-current focus-visible:outline-none',
            outbound && !failed ? 'text-primary-fg/75' : 'text-fg-subtle',
          )}
        >
          <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
          {outbound && <StatusIndicator status={message.status} />}
        </button>
      </div>

      {failed && (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-danger">
          <AlertIcon className="h-4 w-4" />
          <span>{t('bubble.notSent')}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="font-semibold underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {t('bubble.retry')}
            </button>
          )}
        </div>
      )}

      {expanded && (
        <div className="mt-1 w-full max-w-[85%] rounded-lg border border-border bg-surface p-3 text-xs text-fg-muted shadow-sm sm:max-w-[70%]">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="font-medium text-fg">{t('common.status')}</dt>
            <dd>{statusLabel(message.status, t)}</dd>
            <dt className="font-medium text-fg">
              {outbound ? t('status.sent') : t('status.received')}
            </dt>
            <dd>{formatDateTime(message.created_at)}</dd>
            {!message.pending && (
              <>
                <dt className="font-medium text-fg">{t('bubble.id')}</dt>
                <dd className="font-mono break-all">{message.id}</dd>
              </>
            )}
            {message.error_message && (
              <>
                <dt className="font-medium text-danger">{t('bubble.error')}</dt>
                <dd className="break-words text-danger">{message.error_message}</dd>
              </>
            )}
            {message.modem_response && (
              <>
                <dt className="font-medium text-fg">{t('bubble.modem')}</dt>
                <dd className="font-mono break-all whitespace-pre-wrap">
                  {message.modem_response}
                </dd>
              </>
            )}
          </dl>
          <div className="mt-2 flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="ghost"
              icon={<CopyIcon className="h-4 w-4" />}
              onClick={onCopy}
            >
              {t('common.copy')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<TrashIcon className="h-4 w-4" />}
              onClick={onDelete}
              disabled={message.pending}
              className="text-danger hover:bg-danger-soft hover:text-danger-soft-fg"
            >
              {t('common.delete')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
