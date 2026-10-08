import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import api from '@/lib/api';
import {
  chatPath,
  isDialable,
  normalizePhone,
  notifyUnreadChanged,
  type SendSMSResponse,
} from '@/lib/messages';
import Composer from '@/components/chat/Composer';
import { Alert, ArrowLeftIcon, Button } from '@/components/ui';

export default function NewConversation({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async (body: string): Promise<boolean> => {
    const phone = normalizePhone(to);
    if (!isDialable(phone)) {
      setError('Enter a phone number of up to 20 digits, optionally starting with +.');
      return false;
    }
    setError('');
    setSending(true);
    try {
      await api.post<SendSMSResponse>('/sms/send', { to: phone, body });
      notifyUnreadChanged();
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
        <label htmlFor="new-to" className="pl-1 text-sm font-medium text-fg-muted">
          To:
        </label>
        <input
          id="new-to"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="+1 555 123 4567"
          aria-invalid={error !== ''}
          aria-describedby={error ? 'new-to-error' : undefined}
          className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
        />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-app px-4 py-6">
        {error ? (
          <div id="new-to-error" role="alert" className="mx-auto max-w-md">
            <Alert>{error}</Alert>
          </div>
        ) : (
          <p className="text-center text-sm text-fg-muted">
            Enter a number and write your first message.
          </p>
        )}
      </div>
      <Composer onSend={handleSend} disabled={sending} />
    </div>
  );
}
