import { cn } from '@/lib/cn';
import { formatDateTime, formatTime } from '@/lib/format';
import type { ThreadMessage } from '@/lib/useChat';
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
  onRetry: () => void;
}

function StatusIndicator({ status }: { status: string }) {
  if (status === 'pending' || status === 'sending') {
    return (
      <span title="Sending" className="inline-flex">
        <ClockIcon className="h-3.5 w-3.5" />
        <span className="sr-only">Sending</span>
      </span>
    );
  }
  if (status === 'sent') {
    return (
      <span title="Sent" className="inline-flex">
        <CheckIcon className="h-3.5 w-3.5" />
        <span className="sr-only">Sent</span>
      </span>
    );
  }
  return null;
}

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
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2 text-left text-sm shadow-sm transition sm:max-w-[70%]',
          'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app focus-visible:outline-none',
          outbound ? 'rounded-br-md' : 'rounded-bl-md',
          outbound && !failed && 'bg-primary text-primary-fg',
          outbound && failed && 'bg-danger-soft text-fg ring-1 ring-danger',
          !outbound && 'border border-border bg-surface text-fg',
          highlighted && 'ring-2 ring-warning',
          message.pending && 'opacity-70',
        )}
      >
        <span className="break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
          {message.body}
        </span>
        <span
          className={cn(
            'mt-1 flex items-center justify-end gap-1 text-[11px] leading-none',
            outbound && !failed ? 'text-primary-fg/75' : 'text-fg-subtle',
          )}
        >
          <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
          {outbound && <StatusIndicator status={message.status} />}
        </span>
      </button>

      {failed && (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-danger">
          <AlertIcon className="h-4 w-4" />
          <span>Not sent</span>
          <button
            type="button"
            onClick={onRetry}
            className="font-semibold underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
          >
            Retry
          </button>
        </div>
      )}

      {expanded && (
        <div className="mt-1 w-full max-w-[85%] rounded-lg border border-border bg-surface p-3 text-xs text-fg-muted shadow-sm sm:max-w-[70%]">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="font-medium text-fg">Status</dt>
            <dd className="capitalize">
              {message.status === 'received' ? 'unread' : message.status}
            </dd>
            <dt className="font-medium text-fg">{outbound ? 'Sent' : 'Received'}</dt>
            <dd>{formatDateTime(message.created_at)}</dd>
            {!message.pending && (
              <>
                <dt className="font-medium text-fg">ID</dt>
                <dd className="font-mono break-all">{message.id}</dd>
              </>
            )}
            {message.error_message && (
              <>
                <dt className="font-medium text-danger">Error</dt>
                <dd className="break-words text-danger">{message.error_message}</dd>
              </>
            )}
            {message.modem_response && (
              <>
                <dt className="font-medium text-fg">Modem</dt>
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
              Copy
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<TrashIcon className="h-4 w-4" />}
              onClick={onDelete}
              disabled={message.pending}
              className="text-danger hover:bg-danger-soft hover:text-danger-soft-fg"
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
