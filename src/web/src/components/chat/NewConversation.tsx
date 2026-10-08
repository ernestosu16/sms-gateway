import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import api from '@/lib/api';
import {
  chatPath,
  isDialable,
  MAX_CONTACT_NAME,
  RECIPIENT_FORMAT_HINT,
  notifyConversationsChanged,
  type SendSMSResponse,
} from '@/lib/messages';
import { describeTyping } from '@/lib/phone';
import Avatar from '@/components/chat/Avatar';
import Composer from '@/components/chat/Composer';
import PhoneInput from '@/components/PhoneInput';
import { Alert, ArrowLeftIcon, Button, Input } from '@/components/ui';

export default function NewConversation({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const [to, setTo] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async (body: string): Promise<boolean> => {
    // PhoneInput already keeps the value as "+" and digits only.
    const phone = to;
    if (!isDialable(phone)) {
      setError(RECIPIENT_FORMAT_HINT);
      return false;
    }
    setError('');
    setSending(true);
    try {
      await api.post<SendSMSResponse>('/sms/send', { to: phone, body });
      if (name.trim()) {
        // Best effort: the message is already sent, and the name can still be
        // added from the thread header if this fails.
        await api.put('/contacts', { name: name.trim() }, { params: { phone } }).catch(() => {});
      }
      notifyConversationsChanged();
      // Opens the (possibly existing) thread, where a failed send shows up as a
      // bubble with Retry.
      navigate(chatPath(phone), { replace: true });
      return true;
    } catch (err) {
      setError(
        (isAxiosError(err) && (err.response?.data as { error?: string } | undefined)?.error) ||
          'Failed to send message.',
      );
      return false;
    } finally {
      setSending(false);
    }
  };

  const details = describeTyping(to);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 sm:h-16 sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Back to conversations"
          className="lg:hidden"
        >
          <ArrowLeftIcon />
        </Button>
        <h2 className="pl-1 font-semibold text-fg">New message</h2>
      </header>

      <div className="shrink-0 border-b border-border bg-surface px-4 py-3">
        <label htmlFor="new-to" className="mb-1.5 block text-xs font-medium text-fg-muted">
          To
        </label>
        <PhoneInput
          id="new-to"
          value={to}
          onChange={(value) => {
            setTo(value);
            setError('');
          }}
          autoFocus
          aria-invalid={error !== ''}
          aria-describedby={error ? 'new-to-error' : undefined}
        />
        <label htmlFor="new-name" className="mt-3 mb-1.5 block text-xs font-medium text-fg-muted">
          Name <span className="font-normal text-fg-subtle">(optional)</span>
        </label>
        <Input
          id="new-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_CONTACT_NAME}
          placeholder="e.g. Jane Doe"
          autoComplete="off"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto bg-app px-4 py-8">
        {error && (
          <div id="new-to-error" role="alert" className="mb-6 w-full max-w-md">
            <Alert>{error}</Alert>
          </div>
        )}
        {isDialable(to) ? (
          <div className="flex flex-col items-center text-center">
            <Avatar phone={to} name={name.trim()} size="lg" />
            <p className="mt-3 text-lg font-semibold text-fg">{name.trim() || details.formatted}</p>
            <p className="text-sm text-fg-muted">
              {[name.trim() && details.formatted, details.countryName].filter(Boolean).join(' · ')}
            </p>
            <p className="mt-4 text-sm text-fg-subtle">Write your first message below.</p>
          </div>
        ) : (
          !error && (
            <p className="max-w-sm text-center text-sm text-fg-muted">
              Type the number starting with the country code. The country is detected automatically.
            </p>
          )
        )}
      </div>
      <Composer onSend={handleSend} disabled={sending} />
    </div>
  );
}
