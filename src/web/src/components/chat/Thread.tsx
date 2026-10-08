import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ComponentRef } from 'react';
import { useLocation } from 'react-router-dom';
import api from '@/lib/api';
import { copyToClipboard } from '@/lib/clipboard';
import { formatDayLabel, isSameDay } from '@/lib/format';
import { isDialable, notifyUnreadChanged } from '@/lib/messages';
import { useThread, type ThreadMessage } from '@/lib/useChat';
import Avatar from '@/components/chat/Avatar';
import Composer from '@/components/chat/Composer';
import MessageBubble from '@/components/chat/MessageBubble';
import {
  Alert,
  ArrowDownIcon,
  ArrowLeftIcon,
  Button,
  CopyIcon,
  LoadingState,
  TrashIcon,
  useConfirm,
} from '@/components/ui';

// Distance from an edge, in px, that still counts as "at" that edge.
const EDGE_PX = 80;
// Consecutive messages from one side closer than this are drawn as one group.
const GROUP_GAP_MS = 5 * 60 * 1000;

interface ThreadProps {
  phone: string;
  onBack: () => void;
  onDeleted: () => void;
}

export default function Thread({ phone, onBack, onDeleted }: ThreadProps) {
  const { messages, loading, loadingOlder, hasOlder, error, loadOlder, send, remove } =
    useThread(phone);
  const { confirm, dialog } = useConfirm();
  const canReply = isDialable(phone);
  const location = useLocation();
  const scrollRef = useRef<ComponentRef<'div'>>(null);
  const atBottomRef = useRef(true);
  const prevRef = useRef({ first: '', last: '', height: 0 });
  const [showJump, setShowJump] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  // A /messages/:id link lands here with #msg-<id>; that bubble gets a ring.
  const [highlightId, setHighlightId] = useState(() =>
    location.hash.startsWith('#msg-') ? location.hash.slice(5) : '',
  );

  // Keeps the viewport anchored the way chat apps do: jump to the bottom on
  // open, hold position when history loads above, and follow new messages only
  // if the user was already at the bottom (otherwise offer a "new messages" pill).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prev = prevRef.current;
    const first = messages[0]?.id ?? '';
    const last = messages[messages.length - 1]?.id ?? '';

    if (!prev.last && last) {
      const target = highlightId ? document.getElementById(`msg-${highlightId}`) : null;
      if (target) target.scrollIntoView({ block: 'center' });
      else el.scrollTop = el.scrollHeight;
    } else if (first !== prev.first && last === prev.last) {
      el.scrollTop += el.scrollHeight - prev.height;
    } else if (last !== prev.last) {
      if (atBottomRef.current || messages[messages.length - 1]?.pending) {
        el.scrollTop = el.scrollHeight;
      } else {
        setShowJump(true);
      }
    }

    prevRef.current = { first, last, height: el.scrollHeight };
  }, [messages, highlightId]);

  useEffect(() => {
    if (!highlightId) return;
    const id = window.setTimeout(() => setHighlightId(''), 4000);
    return () => window.clearTimeout(id);
  }, [highlightId]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(''), 2500);
    return () => window.clearTimeout(id);
  }, [notice]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < EDGE_PX;
    if (atBottomRef.current) setShowJump(false);
    if (el.scrollTop < EDGE_PX && hasOlder && !loadingOlder) loadOlder();
  };

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setShowJump(false);
  };

  const handleCopy = async (text: string, what: string) => {
    try {
      await copyToClipboard(text);
      setNotice(`${what} copied`);
    } catch {
      setNotice('Copy failed');
    }
  };

  const handleDeleteMessage = async (msg: ThreadMessage) => {
    const ok = await confirm({
      title: 'Delete this message?',
      description: 'It is removed from the gateway. This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await remove(msg);
      setExpandedId(null);
      notifyUnreadChanged();
    } catch {
      setNotice('Failed to delete message');
    }
  };

  const handleDeleteConversation = async () => {
    const ok = await confirm({
      title: 'Delete conversation?',
      description: (
        <>
          Every message sent to or received from <strong className="text-fg">{phone}</strong> is
          removed. This cannot be undone.
        </>
      ),
      confirmLabel: 'Delete conversation',
    });
    if (!ok) return;
    try {
      await api.delete('/sms/conversations', { params: { phone } });
      notifyUnreadChanged();
      onDeleted();
    } catch {
      setNotice('Failed to delete conversation');
    }
  };

  const handleRetry = (msg: ThreadMessage) => {
    // A placeholder that never reached the server is replaced by the retry; a
    // stored failure stays as a record of the attempt.
    if (msg.id.startsWith('temp-')) remove(msg);
    send(msg.body);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 sm:h-16 sm:gap-3 sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Back to conversations"
          className="lg:hidden"
        >
          <ArrowLeftIcon />
        </Button>
        <Avatar phone={phone} size="sm" />
        <h2 className="min-w-0 flex-1 truncate font-semibold text-fg">{phone}</h2>
        {notice && (
          <span role="status" className="hidden text-xs text-fg-muted sm:inline">
            {notice}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleCopy(phone, 'Number')}
          aria-label="Copy phone number"
          title="Copy phone number"
        >
          <CopyIcon className="h-[18px] w-[18px]" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDeleteConversation}
          aria-label="Delete conversation"
          title="Delete conversation"
          className="hover:bg-danger-soft hover:text-danger-soft-fg"
        >
          <TrashIcon className="h-[18px] w-[18px]" />
        </Button>
      </header>

      {notice && (
        <p role="status" className="bg-fg px-4 py-1 text-center text-xs text-app sm:hidden">
          {notice}
        </p>
      )}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          role="log"
          aria-live="polite"
          aria-label={`Messages with ${phone}`}
          className="h-full overflow-y-auto overscroll-contain bg-app px-3 pb-4 sm:px-6"
        >
          {hasOlder && (
            <div className="flex justify-center pt-3">
              <Button variant="ghost" size="sm" onClick={loadOlder} loading={loadingOlder}>
                Load older messages
              </Button>
            </div>
          )}

          {error && <Alert className="mx-auto mt-3 max-w-md">{error}</Alert>}

          {loading ? (
            <LoadingState label="Loading messages…" />
          ) : messages.length === 0 ? (
            <p className="py-20 text-center text-sm text-fg-muted">
              No messages yet. Say hello below.
            </p>
          ) : (
            messages.map((msg, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || !isSameDay(prev.created_at, msg.created_at);
              const startsGroup =
                !newDay &&
                (prev.direction !== msg.direction ||
                  new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() >
                    GROUP_GAP_MS);

              return (
                <Fragment key={msg.id}>
                  {newDay && (
                    <div className="sticky top-0 z-10 flex justify-center py-3">
                      <span className="rounded-full border border-border bg-surface/90 px-3 py-0.5 text-xs font-medium text-fg-muted shadow-sm backdrop-blur">
                        {formatDayLabel(msg.created_at)}
                      </span>
                    </div>
                  )}
                  <MessageBubble
                    message={msg}
                    startsGroup={startsGroup}
                    highlighted={msg.id === highlightId}
                    expanded={msg.id === expandedId}
                    onToggle={() => setExpandedId((id) => (id === msg.id ? null : msg.id))}
                    onCopy={() => handleCopy(msg.body, 'Message')}
                    onDelete={() => handleDeleteMessage(msg)}
                    onRetry={canReply ? () => handleRetry(msg) : undefined}
                  />
                </Fragment>
              );
            })
          )}
        </div>

        {showJump && (
          <Button
            size="sm"
            onClick={jumpToBottom}
            icon={<ArrowDownIcon className="h-4 w-4" />}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-lg"
          >
            New messages
          </Button>
        )}
      </div>

      {canReply ? (
        <Composer
          autoFocus
          onSend={(body) => {
            // The bubble itself reports a failure and offers Retry, so the draft
            // never needs to come back.
            send(body);
            return true;
          }}
        />
      ) : (
        // Alphanumeric senders cannot receive SMS, and numbers stored before
        // the + rule lack a country code the server would require to reply.
        <p className="shrink-0 border-t border-border bg-surface px-4 py-3 text-center text-xs text-fg-muted">
          {/^\d+$/.test(phone)
            ? 'This number has no country code, so it cannot be replied to here. Start a new message using its international format (+ and country code).'
            : 'This sender does not accept replies.'}
        </p>
      )}
      {dialog}
    </div>
  );
}
