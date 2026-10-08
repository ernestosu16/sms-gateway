import { useState, useEffect, useCallback, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import api from '@/lib/api';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/locales/en';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import { useMessageStats } from '@/lib/messageActivity';
import {
  chatPath,
  notifyConversationsChanged,
  onConversationsChanged,
  type Message,
} from '@/lib/messages';
import { usePolling } from '@/lib/usePolling';
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

/** How many recent messages the dashboard shows, and therefore fetches. */
const RECENT_LIMIT = 10;

const MODEM_POLL_MS = 30000;

const QUALITY_LABELS: Record<string, MessageKey> = {
  excellent: 'quality.excellent',
  good: 'quality.good',
  fair: 'quality.fair',
  poor: 'quality.poor',
  none: 'quality.none',
  unknown: 'quality.unknown',
};

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
  const { t } = useI18n();
  const [modemStatus, setModemStatus] = useState<ModemStatus | null>(null);
  const [modemSignal, setModemSignal] = useState<ModemSignal | null>(null);
  const [recentMessages, setRecentMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  // Counts come from the app-wide activity watcher, which also tells this page
  // when a message arrives, is sent or changes status.
  const stats = useMessageStats();
  const totalSent = stats?.sent ?? 0;
  const totalReceived = stats?.inbound ?? 0;
  const pendingCount = stats?.pending ?? 0;

  // Quick send form
  const [to, setTo] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const fetchModem = useCallback(async () => {
    const [statusRes, signalRes] = await Promise.allSettled([
      api.get<ModemStatus>('/modem/status'),
      api.get<ModemSignal>('/modem/signal'),
    ]);
    if (statusRes.status === 'fulfilled') setModemStatus(statusRes.value.data);
    else setModemStatus({ status: 'error' });
    if (signalRes.status === 'fulfilled') setModemSignal(signalRes.value.data);
  }, []);

  // The recent list asks for only the rows it renders instead of downloading
  // both mailboxes.
  const fetchRecent = useCallback(async () => {
    const [inboxRes, outboxRes] = await Promise.allSettled([
      api.get<Message[]>('/sms/inbox', { params: { all: 'true', limit: RECENT_LIMIT } }),
      api.get<Message[]>('/sms/outbox', { params: { limit: RECENT_LIMIT } }),
    ]);
    const inbox = inboxRes.status === 'fulfilled' ? inboxRes.value.data : [];
    const outbox = outboxRes.status === 'fulfilled' ? outboxRes.value.data : [];

    // Both sides arrive newest-first, so merging the two newest-N lists and
    // taking the newest N yields the same result as sorting everything.
    const combined = [...inbox, ...outbox]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, RECENT_LIMIT);
    setRecentMessages(combined);
  }, []);

  useEffect(() => {
    Promise.all([fetchModem(), fetchRecent()]).finally(() => setLoading(false));
  }, [fetchModem, fetchRecent]);
  useEffect(() => onConversationsChanged(fetchRecent), [fetchRecent]);
  usePolling(fetchModem, MODEM_POLL_MS);

  const handleQuickSend = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setSendResult(null);
    try {
      const res = await api.post('/sms/send', { to, body });
      if (res.data.status === 'sent') {
        setSendResult({ type: 'success', message: t('dashboard.sent') });
        setTo('');
        setBody('');
        notifyConversationsChanged();
      } else {
        setSendResult({ type: 'error', message: res.data.message || t('chat.sendFailed') });
      }
    } catch (err) {
      // A 400 carries the reason, e.g. a number not in international format.
      const reason = isAxiosError(err)
        ? (err.response?.data as { error?: string } | undefined)?.error
        : undefined;
      setSendResult({ type: 'error', message: reason || t('chat.sendFailed') });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <LoadingState label={t('dashboard.loading')} />;
  }

  const modemOk = modemStatus?.status === 'ok';
  const qualityLabel = (quality: string) => {
    const key = QUALITY_LABELS[quality];
    return key ? t(key) : quality;
  };
  const bars = modemSignal ? signalBars(modemSignal.quality) : 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.dashboard')} description={t('dashboard.description')} />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label={t('dashboard.modem')}
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
              {modemOk ? t('dashboard.online') : t('dashboard.offline')}
            </span>
          </span>
        </StatCard>

        <StatCard
          label={t('dashboard.signal')}
          icon={<SignalIcon className="h-5 w-5" />}
          tone="primary"
        >
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
            <span className="text-sm font-medium text-fg-muted first-letter:uppercase">
              {qualityLabel(modemSignal?.quality ?? 'unknown')}
              {modemSignal && modemSignal.quality !== 'unknown' ? ` (${modemSignal.signal})` : ''}
            </span>
          </span>
        </StatCard>

        <StatCard
          label={t('dashboard.totalSent')}
          icon={<OutboxIcon className="h-5 w-5" />}
          tone="primary"
        >
          {formatNumber(totalSent)}
        </StatCard>

        <StatCard
          label={t('dashboard.totalReceived')}
          icon={<InboxIcon className="h-5 w-5" />}
          tone="primary"
        >
          {formatNumber(totalReceived)}
        </StatCard>
      </div>

      {pendingCount > 0 && (
        <Alert tone="warning">
          {t(pendingCount === 1 ? 'dashboard.pending.one' : 'dashboard.pending.other', {
            count: formatNumber(pendingCount),
          })}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Quick Send */}
        <Card className="self-start">
          <CardHeader title={t('dashboard.quickSend')} />
          <CardBody>
            <form onSubmit={handleQuickSend} className="space-y-4">
              {sendResult && (
                <Alert tone={sendResult.type === 'success' ? 'success' : 'danger'}>
                  {sendResult.message}
                </Alert>
              )}
              <div>
                <label htmlFor="quickTo" className="mb-1.5 block text-sm font-medium text-fg">
                  {t('dashboard.phoneNumber')}
                </label>
                <PhoneInput id="quickTo" value={to} onChange={setTo} required />
              </div>
              <Field label={t('common.message')} htmlFor="quickBody">
                <Textarea
                  id="quickBody"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  rows={3}
                  placeholder={t('dashboard.placeholder')}
                />
              </Field>
              <Button
                type="submit"
                loading={sending}
                icon={<SendIcon className="h-4 w-4" />}
                className="w-full"
              >
                {sending ? t('common.sending') : t('dashboard.send')}
              </Button>
            </form>
          </CardBody>
        </Card>

        {/* Recent Messages */}
        <Card className="lg:col-span-2">
          <CardHeader title={t('dashboard.recent')} />
          {recentMessages.length === 0 ? (
            <EmptyState
              icon={<MessageIcon className="h-6 w-6" />}
              title={t('dashboard.noMessages')}
            />
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
