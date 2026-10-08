import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import api from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/format';
import type { Message } from '@/lib/usePaginatedList';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  Field,
  Input,
  LoadingState,
  MessageStatusBadge,
  OutboxIcon,
  SendIcon,
  Textarea,
  PageHeader,
  type Column,
} from '@/components/ui';

const SMS_CHAR_LIMIT = 160;
const RECENT_LIMIT = 20;

const columns: Column<Message>[] = [
  {
    key: 'to',
    header: 'To',
    mobile: 'title',
    className: 'whitespace-nowrap font-medium text-fg',
    cell: (msg) => msg.phone_number,
  },
  {
    key: 'body',
    header: 'Message',
    mobile: 'body',
    className: 'w-full max-w-0 truncate text-fg-muted',
    cell: (msg) => msg.body,
  },
  {
    key: 'status',
    header: 'Status',
    mobile: 'title',
    cell: (msg) => <MessageStatusBadge status={msg.status} />,
  },
  {
    key: 'time',
    header: 'Time',
    mobile: 'aside',
    className: 'whitespace-nowrap text-fg-subtle',
    cell: (msg) => formatRelativeTime(msg.created_at),
  },
];

export default function SendSMS() {
  const navigate = useNavigate();
  const [to, setTo] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [sentMessages, setSentMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);

  const fetchSentMessages = async () => {
    try {
      const res = await api.get<Message[]>('/sms/outbox', { params: { limit: RECENT_LIMIT } });
      setSentMessages(res.data.slice(0, RECENT_LIMIT));
    } catch {
      // ignore
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchSentMessages();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      // The API only accepts digits with an optional leading +, so drop the
      // separators people paste in formatted numbers.
      const res = await api.post('/sms/send', { to: to.replace(/[\s().-]/g, ''), body });
      if (res.data.status === 'sent') {
        setResult({ type: 'success', message: 'Message sent successfully.' });
        setTo('');
        setBody('');
        fetchSentMessages();
      } else {
        setResult({ type: 'error', message: res.data.message || 'Failed to send message.' });
      }
    } catch (err) {
      const message = isAxiosError(err) ? err.response?.data?.error : undefined;
      setResult({ type: 'error', message: message || 'Failed to send message.' });
    } finally {
      setSending(false);
    }
  };

  const charCount = body.length;
  const overLimit = charCount > SMS_CHAR_LIMIT;

  return (
    <div className="space-y-6">
      <PageHeader title="Send SMS" description="Send a text message through the connected modem." />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        {/* Send Form */}
        <Card className="self-start xl:col-span-2">
          <CardHeader title="New message" />
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              {result && (
                <Alert tone={result.type === 'success' ? 'success' : 'danger'}>
                  {result.message}
                </Alert>
              )}
              <Field label="Phone Number" htmlFor="to">
                <Input
                  id="to"
                  type="tel"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  required
                  placeholder="+1234567890"
                />
              </Field>
              <Field label="Message" htmlFor="body">
                <Textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  rows={5}
                  placeholder="Type your message..."
                  aria-invalid={overLimit || undefined}
                />
                <p
                  className={cn(
                    'text-xs',
                    overLimit ? 'font-medium text-warning' : 'text-fg-subtle',
                  )}
                >
                  {charCount}/{SMS_CHAR_LIMIT} characters
                  {overLimit && ' - message may be split into multiple SMS'}
                </p>
              </Field>
              <Button
                type="submit"
                disabled={!to || !body}
                loading={sending}
                icon={<SendIcon className="h-4 w-4" />}
                className="w-full sm:w-auto"
              >
                {sending ? 'Sending...' : 'Send Message'}
              </Button>
            </form>
          </CardBody>
        </Card>

        {/* Recent Sent Messages */}
        <Card className="overflow-hidden xl:col-span-3">
          <CardHeader title="Recent Sent Messages" />
          {loadingMessages ? (
            <LoadingState label="Loading..." />
          ) : sentMessages.length === 0 ? (
            <EmptyState icon={<OutboxIcon className="h-6 w-6" />} title="No sent messages yet" />
          ) : (
            <DataTable
              rows={sentMessages}
              columns={columns}
              onRowClick={(msg) => navigate(`/messages/${msg.id}`)}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
