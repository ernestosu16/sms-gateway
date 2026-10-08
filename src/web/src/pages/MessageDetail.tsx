import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import type { Message } from '@/lib/usePaginatedList';
import {
  Alert,
  ArrowLeftIcon,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ChevronDownIcon,
  Field,
  LoadingState,
  MessageStatusBadge,
  SendIcon,
  Textarea,
  TrashIcon,
  useConfirm,
} from '@/components/ui';

interface MessageDetails extends Message {
  api_key_id?: string;
  modem_response?: string;
  error_message?: string;
  updated_at: string;
}

function BackLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted transition-colors hover:text-primary"
    >
      <ArrowLeftIcon className="h-4 w-4" />
      {children}
    </button>
  );
}

/** Label/value row: stacked on phones, side by side from sm up. */
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm font-medium text-fg-subtle">{label}</dt>
      <dd className="min-w-0 text-sm text-fg">{children}</dd>
    </div>
  );
}

export default function MessageDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [message, setMessage] = useState<MessageDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { confirm, dialog } = useConfirm();
  const [debugOpen, setDebugOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replyResult, setReplyResult] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [togglingRead, setTogglingRead] = useState(false);

  useEffect(() => {
    const fetchMessage = async () => {
      try {
        const res = await api.get<MessageDetails>(`/sms/${id}`);
        setMessage(res.data);
      } catch {
        setError('Message not found.');
      } finally {
        setLoading(false);
      }
    };
    fetchMessage();
  }, [id]);

  if (loading) {
    return <LoadingState label="Loading message..." />;
  }

  if (error || !message) {
    return (
      <div className="space-y-4">
        <BackLink onClick={() => navigate(-1)}>Back</BackLink>
        <Alert>{error || 'Message not found.'}</Alert>
      </div>
    );
  }

  const backPath = message.direction === 'inbound' ? '/inbox' : '/outbox';
  const backLabel = message.direction === 'inbound' ? 'Inbox' : 'Outbox';
  const phoneLabel = message.direction === 'inbound' ? 'From' : 'To';
  const hasDebugInfo = message.modem_response || message.error_message;

  const handleToggleRead = async () => {
    if (!message) return;
    setTogglingRead(true);
    try {
      const endpoint =
        message.status === 'received' ? `/sms/${message.id}/read` : `/sms/${message.id}/unread`;
      await api.put(endpoint);
      setMessage({
        ...message,
        status: message.status === 'received' ? 'read' : 'received',
      });
    } catch {
      setError('Failed to update message status.');
    } finally {
      setTogglingRead(false);
    }
  };

  const handleReply = async (e: FormEvent) => {
    e.preventDefault();
    setReplySending(true);
    setReplyResult(null);
    try {
      const res = await api.post('/sms/send', { to: message.phone_number, body: replyBody });
      if (res.data.status === 'sent') {
        setReplyResult({ type: 'success', message: 'Reply sent successfully.' });
        setReplyBody('');
      } else {
        setReplyResult({ type: 'error', message: res.data.message || 'Failed to send reply.' });
      }
    } catch {
      setReplyResult({ type: 'error', message: 'Failed to send reply.' });
    } finally {
      setReplySending(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete this message?',
      description: 'This permanently removes it from the gateway and cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      await api.delete(`/sms/${message.id}`);
      navigate(backPath);
    } catch {
      setError('Failed to delete message.');
      setDeleting(false);
    }
  };

  const canToggleRead =
    message.direction === 'inbound' && (message.status === 'received' || message.status === 'read');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <BackLink onClick={() => navigate(backPath)}>Back to {backLabel}</BackLink>
        <div className="flex flex-wrap items-center gap-2">
          {canToggleRead && (
            <Button variant="secondary" size="sm" onClick={handleToggleRead} loading={togglingRead}>
              {togglingRead
                ? 'Updating...'
                : message.status === 'received'
                  ? 'Mark as Read'
                  : 'Mark as Unread'}
            </Button>
          )}
          <Button
            variant="danger-soft"
            size="sm"
            onClick={handleDelete}
            loading={deleting}
            icon={<TrashIcon className="h-4 w-4" />}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-lg">
                <span className="font-normal text-fg-muted">{phoneLabel}</span>{' '}
                {message.phone_number}
              </span>
              <Badge tone={message.direction === 'inbound' ? 'primary' : 'neutral'}>
                {message.direction === 'inbound' ? 'Inbound' : 'Outbound'}
              </Badge>
            </span>
          }
          description={formatRelativeTime(message.created_at)}
          actions={<MessageStatusBadge status={message.status} />}
        />
        <CardBody>
          <p className="rounded-lg bg-surface-muted p-4 text-sm leading-relaxed break-words whitespace-pre-wrap text-fg">
            {message.body}
          </p>
          <dl className="mt-4 divide-y divide-border">
            <DetailRow label="Created">
              {formatDateTime(message.created_at)}{' '}
              <span className="text-fg-subtle">({formatRelativeTime(message.created_at)})</span>
            </DetailRow>
            <DetailRow label="Updated">
              {formatDateTime(message.updated_at)}{' '}
              <span className="text-fg-subtle">({formatRelativeTime(message.updated_at)})</span>
            </DetailRow>
            <DetailRow label="ID">
              <span className="font-mono text-xs break-all text-fg-muted">{message.id}</span>
            </DetailRow>
          </dl>
        </CardBody>
      </Card>

      {/* Reply Section */}
      {message.direction === 'inbound' && (
        <Card>
          <CardHeader title="Reply" description={`Replying to ${message.phone_number}`} />
          <CardBody>
            <form onSubmit={handleReply} className="space-y-4">
              {replyResult && (
                <Alert tone={replyResult.type === 'success' ? 'success' : 'danger'}>
                  {replyResult.message}
                </Alert>
              )}
              <Field label="Message" htmlFor="replyBody">
                <Textarea
                  id="replyBody"
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  required
                  rows={3}
                  placeholder="Type your reply..."
                />
              </Field>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  loading={replySending}
                  icon={<SendIcon className="h-4 w-4" />}
                  className="w-full sm:w-auto"
                >
                  {replySending ? 'Sending...' : 'Send Reply'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* Debug Section */}
      {hasDebugInfo && (
        <Card className="overflow-hidden">
          <button
            type="button"
            onClick={() => setDebugOpen(!debugOpen)}
            aria-expanded={debugOpen}
            className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-surface-hover sm:px-6"
          >
            <span className="text-sm font-medium text-fg">Debug Information</span>
            <ChevronDownIcon
              className={cn(
                'h-5 w-5 text-fg-subtle transition-transform',
                debugOpen && 'rotate-180',
              )}
            />
          </button>
          {debugOpen && (
            <div className="space-y-4 border-t border-border px-4 py-4 sm:px-6">
              {message.modem_response && (
                <div>
                  <span className="mb-1.5 block text-xs font-medium tracking-wide text-fg-subtle uppercase">
                    Modem Response
                  </span>
                  <pre className="overflow-x-auto rounded-lg bg-code p-3 text-xs text-code-fg">
                    {message.modem_response}
                  </pre>
                </div>
              )}
              {message.error_message && (
                <div>
                  <span className="mb-1.5 block text-xs font-medium tracking-wide text-fg-subtle uppercase">
                    Error Message
                  </span>
                  <pre className="overflow-x-auto rounded-lg bg-danger-soft p-3 text-xs whitespace-pre-wrap text-danger-soft-fg">
                    {message.error_message}
                  </pre>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {dialog}
    </div>
  );
}
