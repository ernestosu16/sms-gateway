import { useState, useEffect, useCallback, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import api from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/format';
import { chatPath, type Message } from '@/lib/messages';
import PhoneInput from '@/components/PhoneInput';
import {
  Alert,
  AlertIcon,
  Button,
  CheckCircleIcon,
  Card,
  CardBody,
  CardHeader,
  DirectionBadge,
  EmptyState,
  Field,
  LoadingState,
  MessageIcon,
  MessageStatusBadge,
  OutboxIcon,
  InboxIcon,
  PageHeader,
  SendIcon,
  SignalIcon,
  Textarea,
} from '@/components/ui';

interface ModemStatus {
  status: string;
}

interface ModemSignal {
  signal: number;
  quality: string;
}

// Whole-table counts from /sms/stats. Deriving these from a page of messages
// would report the page size instead of the real total.
interface MessageStats {
  total: number;
  inbound: number;
  outbound: number;
  unread: number;
  sent: number;
  pending: number;
  failed: number;
}

/** How many recent messages the dashboard shows, and therefore fetches. */
const RECENT_LIMIT = 10;

function signalBars(quality: string): number {
  switch (quality) {
    case 'excellent':
      return 5;
    case 'good':
      return 4;
    case 'fair':
      return 3;
    case 'poor':
      return 2;
    case 'none':
      return 0;
    default:
      return 0;
  }
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [modemStatus, setModemStatus] = useState<ModemStatus | null>(null);
  const [modemSignal, setModemSignal] = useState<ModemSignal | null>(null);
  const [recentMessages, setRecentMessages] = useState<Message[]>([]);
  const [totalSent, setTotalSent] = useState(0);
  const [totalReceived, setTotalReceived] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Quick send form
  const [to, setTo] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      // The counters come from an aggregate endpoint and the recent list asks
      // for only the rows it renders. This page previously downloaded both
      // entire mailboxes to show three numbers and ten rows.
      const [statusRes, signalRes, statsRes, inboxRes, outboxRes] = await Promise.allSettled([
        api.get<ModemStatus>('/modem/status'),
        api.get<ModemSignal>('/modem/signal'),
        api.get<MessageStats>('/sms/stats'),
        api.get<Message[]>('/sms/inbox', { params: { all: 'true', limit: RECENT_LIMIT } }),
        api.get<Message[]>('/sms/outbox', { params: { limit: RECENT_LIMIT } }),
      ]);

      if (statusRes.status === 'fulfilled') setModemStatus(statusRes.value.data);
      else setModemStatus({ status: 'error' });

      if (signalRes.status === 'fulfilled') setModemSignal(signalRes.value.data);

      if (statsRes.status === 'fulfilled') {
        const stats = statsRes.value.data;
        setTotalReceived(stats.inbound);
        setTotalSent(stats.sent);
        setPendingCount(stats.pending);
      }

      const inbox = inboxRes.status === 'fulfilled' ? inboxRes.value.data : [];
      const outbox = outboxRes.status === 'fulfilled' ? outboxRes.value.data : [];

      // Both sides arrive newest-first, so merging the two newest-N lists and
      // taking the newest N yields the same result as sorting everything.
      const combined = [...inbox, ...outbox]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, RECENT_LIMIT);
      setRecentMessages(combined);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(async () => {
      try {
        const [statusRes, signalRes] = await Promise.allSettled([
          api.get<ModemStatus>('/modem/status'),
          api.get<ModemSignal>('/modem/signal'),
        ]);
        if (statusRes.status === 'fulfilled') setModemStatus(statusRes.value.data);
        else setModemStatus({ status: 'error' });
        if (signalRes.status === 'fulfilled') setModemSignal(signalRes.value.data);
      } catch {
        // ignore
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleQuickSend = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setSendResult(null);
    try {
      const res = await api.post('/sms/send', { to, body });
      if (res.data.status === 'sent') {
        setSendResult({ type: 'success', message: 'Message sent successfully.' });
        setTo('');
        setBody('');
        fetchData();
      } else {
        setSendResult({ type: 'error', message: res.data.message || 'Failed to send message.' });
      }
    } catch (err) {
      // A 400 carries the reason, e.g. a number not in international format.
      const reason = isAxiosError(err)
        ? (err.response?.data as { error?: string } | undefined)?.error
        : undefined;
      setSendResult({ type: 'error', message: reason || 'Failed to send message.' });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading dashboard..." />;
  }

  const modemOk = modemStatus?.status === 'ok';
  const bars = modemSignal ? signalBars(modemSignal.quality) : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Modem health and message activity at a glance." />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Modem"
          icon={
            modemOk ? <CheckCircleIcon className="h-5 w-5" /> : <AlertIcon className="h-5 w-5" />
          }
          tone={modemOk ? 'success' : 'danger'}
        >
          <span className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {modemOk && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              )}
              <span
                className={cn(
                  'relative inline-flex h-2.5 w-2.5 rounded-full',
                  modemOk ? 'bg-success' : 'bg-danger',
                )}
              />
            </span>
            <span className={modemOk ? 'text-success' : 'text-danger'}>
              {modemOk ? 'Online' : 'Offline'}
            </span>
          </span>
        </StatCard>

        <StatCard label="Signal" icon={<SignalIcon className="h-5 w-5" />} tone="primary">
          <span className="flex items-end gap-2">
            <span className="flex items-end gap-0.5" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((level) => (
                <span
                  key={level}
                  className={cn(
                    'w-1.5 rounded-sm',
                    bars >= level ? 'bg-success' : 'bg-border-strong',
                  )}
                  style={{ height: `${level * 4 + 4}px` }}
                />
              ))}
            </span>
            <span className="text-sm font-medium text-fg-muted capitalize">
              {modemSignal ? modemSignal.quality : 'unknown'}
              {modemSignal && modemSignal.quality !== 'unknown' ? ` (${modemSignal.signal})` : ''}
            </span>
          </span>
        </StatCard>

        <StatCard label="Total Sent" icon={<OutboxIcon className="h-5 w-5" />} tone="primary">
          {totalSent.toLocaleString()}
        </StatCard>

        <StatCard label="Total Received" icon={<InboxIcon className="h-5 w-5" />} tone="primary">
          {totalReceived.toLocaleString()}
        </StatCard>
      </div>

      {pendingCount > 0 && (
        <Alert tone="warning">
          {pendingCount} message{pendingCount !== 1 ? 's' : ''} pending delivery.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Quick Send */}
        <Card className="self-start">
          <CardHeader title="Quick Send" />
          <CardBody>
            <form onSubmit={handleQuickSend} className="space-y-4">
              {sendResult && (
                <Alert tone={sendResult.type === 'success' ? 'success' : 'danger'}>
                  {sendResult.message}
                </Alert>
              )}
              <div>
                <label htmlFor="quickTo" className="mb-1.5 block text-sm font-medium text-fg">
                  Phone Number
                </label>
                <PhoneInput id="quickTo" value={to} onChange={setTo} required />
              </div>
              <Field label="Message" htmlFor="quickBody">
                <Textarea
                  id="quickBody"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  rows={3}
                  placeholder="Type your message..."
                />
              </Field>
              <Button
                type="submit"
                loading={sending}
                icon={<SendIcon className="h-4 w-4" />}
                className="w-full"
              >
                {sending ? 'Sending...' : 'Send SMS'}
              </Button>
            </form>
          </CardBody>
        </Card>

        {/* Recent Messages */}
        <Card className="lg:col-span-2">
          <CardHeader title="Recent Messages" />
          {recentMessages.length === 0 ? (
            <EmptyState icon={<MessageIcon className="h-6 w-6" />} title="No messages yet" />
          ) : (
            <ul className="divide-y divide-border">
              {recentMessages.map((msg) => {
                const unread = msg.direction === 'inbound' && msg.status === 'received';
                return (
                  <li key={msg.id}>
                    <button
                      type="button"
                      onClick={() => navigate(chatPath(msg.phone_number))}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none sm:px-6"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <DirectionBadge direction={msg.direction} />
                          <span
                            className={cn(
                              'text-sm text-fg',
                              unread ? 'font-semibold' : 'font-medium',
                            )}
                          >
                            {msg.phone_number}
                          </span>
                          {msg.direction === 'inbound' && (
                            <MessageStatusBadge status={msg.status} />
                          )}
                        </div>
                        <p
                          className={cn(
                            'mt-1 truncate text-sm',
                            unread ? 'font-medium text-fg' : 'text-fg-muted',
                          )}
                        >
                          {msg.body}
                        </p>
                      </div>
                      <span className="shrink-0 pt-0.5 text-xs text-fg-subtle">
                        {formatRelativeTime(msg.created_at)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

const statTones = {
  primary: 'bg-primary-soft text-primary-soft-fg',
  success: 'bg-success-soft text-success-soft-fg',
  danger: 'bg-danger-soft text-danger-soft-fg',
} as const;

function StatCard({
  label,
  icon,
  tone,
  children,
}: {
  label: string;
  icon: ReactNode;
  tone: keyof typeof statTones;
  children: ReactNode;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-fg-subtle uppercase sm:text-sm sm:normal-case sm:tracking-normal">
          {label}
        </p>
        <span
          className={cn(
            'hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:flex',
            statTones[tone],
          )}
        >
          {icon}
        </span>
      </div>
      <div className="mt-2 text-xl font-semibold text-fg sm:text-2xl">{children}</div>
    </Card>
  );
}
