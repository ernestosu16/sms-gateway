import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ComponentRef } from 'react';
import { useLocation } from 'react-router-dom';
import { isAxiosError } from 'axios';
import api from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { copyToClipboard } from '@/lib/clipboard';
import { formatDayLabel, isSameDay } from '@/lib/format';
import { isDialable, MAX_CONTACT_NAME, notifyConversationsChanged } from '@/lib/messages';
import { useContact } from '@/lib/useContact';
import { describePhone } from '@/lib/phone';
import { useThread, type ThreadMessage } from '@/lib/useChat';
import Avatar from '@/components/chat/Avatar';
import Composer from '@/components/chat/Composer';
import MessageBubble from '@/components/chat/MessageBubble';
import {
  Alert,
  ArrowDownIcon,
  ArrowLeftIcon,
  Button,
  CheckIcon,
  CopyIcon,
  Input,
  LoadingState,
  PencilIcon,
  TrashIcon,
  useConfirm,
  XIcon,
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
  const { t, rich } = useI18n();
  const canReply = isDialable(phone);
  const contact = describePhone(phone);
  const { name: contactName, save: saveContact } = useContact(phone);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const displayName = contactName || contact.formatted;
  const subtitle = contactName
    ? [contact.formatted, contact.countryName].filter(Boolean).join(' · ')
    : contact.countryName;
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

  const handleCopy = async (text: string, copiedNotice: string) => {
    try {
      await copyToClipboard(text);
      setNotice(copiedNotice);
    } catch {
      setNotice(t('thread.copyFailed'));
    }
  };

  const handleDeleteMessage = async (msg: ThreadMessage) => {
    const ok = await confirm({
      title: t('thread.deleteMessageTitle'),
      description: t('thread.deleteMessageBody'),
      confirmLabel: t('common.delete'),
    });
    if (!ok) return;
    try {
      await remove(msg);
      setExpandedId(null);
      notifyConversationsChanged();
    } catch {
      setNotice(t('thread.deleteMessageFailed'));
    }
  };

  const handleDeleteConversation = async () => {
    const ok = await confirm({
      title: t('thread.deleteConversationTitle'),
      description: rich(
        'thread.deleteConversationBody',
        { b: (chunk) => <strong className="text-fg">{chunk}</strong> },
        { name: displayName },
      ),
      confirmLabel: t('thread.deleteConversation'),
    });
    if (!ok) return;
    try {
      await api.delete('/sms/conversations', { params: { phone } });
      notifyConversationsChanged();
      onDeleted();
    } catch {
      setNotice(t('thread.deleteConversationFailed'));
    }
  };

  const startEditingName = () => {
    setNameDraft(contactName);
    setEditingName(true);
  };

  const commitName = async () => {
    setSavingName(true);
    try {
      await saveContact(nameDraft);
      setEditingName(false);
      setNotice(nameDraft.trim() ? t('thread.nameSaved') : t('thread.nameRemoved'));
    } catch (err) {
      setNotice(
        (isAxiosError(err) && (err.response?.data as { error?: string } | undefined)?.error) ||
          t('thread.nameFailed'),
      );
    } finally {
      setSavingName(false);
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
          aria-label={t('chat.back')}
          className="lg:hidden"
        >
          <ArrowLeftIcon />
        </Button>
        <Avatar phone={phone} name={contactName} size="sm" />
        {editingName ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              commitName();
            }}
          >
            <label htmlFor="contact-name" className="sr-only">
              {t('thread.contactName')}
            </label>
            <Input
              id="contact-name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditingName(false);
              }}
              maxLength={MAX_CONTACT_NAME}
              placeholder={t('thread.contactName')}
              autoFocus
              className="h-9"
            />
            <Button
              type="submit"
              size="icon"
              loading={savingName}
              aria-label={t('thread.saveName')}
              title={t('thread.saveNameTitle')}
            >
              {!savingName && <CheckIcon className="h-[18px] w-[18px]" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditingName(false)}
              aria-label={t('common.cancel')}
              title={t('thread.cancelTitle')}
            >
              <XIcon className="h-[18px] w-[18px]" />
            </Button>
          </form>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <h2 className="truncate leading-tight font-semibold text-fg">{displayName}</h2>
              {subtitle && <p className="truncate text-xs text-fg-subtle">{subtitle}</p>}
            </div>
            {notice && (
              <span role="status" className="hidden text-xs text-fg-muted sm:inline">
                {notice}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={startEditingName}
              aria-label={contactName ? t('thread.editContactName') : t('thread.addContactName')}
              title={contactName ? t('thread.editName') : t('thread.addName')}
            >
              <PencilIcon className="h-[18px] w-[18px]" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleCopy(phone, t('thread.copiedNumber'))}
              aria-label={t('thread.copyNumber')}
              title={t('thread.copyNumber')}
            >
              <CopyIcon className="h-[18px] w-[18px]" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDeleteConversation}
              aria-label={t('thread.deleteConversation')}
              title={t('thread.deleteConversation')}
              className="hover:bg-danger-soft hover:text-danger-soft-fg"
            >
              <TrashIcon className="h-[18px] w-[18px]" />
            </Button>
          </>
        )}
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
          aria-label={t('thread.messagesWith', { name: displayName })}
          className="h-full overflow-y-auto overscroll-contain bg-app px-3 pb-4 sm:px-6"
        >
          {hasOlder && (
            <div className="flex justify-center pt-3">
              <Button variant="ghost" size="sm" onClick={loadOlder} loading={loadingOlder}>
                {t('thread.loadOlder')}
              </Button>
            </div>
          )}

          {error && <Alert className="mx-auto mt-3 max-w-md">{error}</Alert>}

          {loading ? (
            <LoadingState label={t('thread.loadingMessages')} />
          ) : messages.length === 0 ? (
            <p className="py-20 text-center text-sm text-fg-muted">{t('thread.empty')}</p>
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
                    onCopy={() => handleCopy(msg.body, t('thread.copiedMessage'))}
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
            {t('thread.newMessages')}
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
          {/^\d+$/.test(phone) ? t('thread.noCountryCode') : t('thread.noReplies')}
        </p>
      )}
      {dialog}
    </div>
  );
}
