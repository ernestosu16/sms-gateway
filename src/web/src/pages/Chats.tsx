import { useEffect, useState, type CSSProperties } from 'react';
import { useMatch, useNavigate, useParams } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n';
import { useResizablePanel } from '@/lib/useResizablePanel';
import { normalizePhone } from '@/lib/messages';
import { useConversations } from '@/lib/useChat';
import ConversationList from '@/components/chat/ConversationList';
import NewConversation from '@/components/chat/NewConversation';
import Thread from '@/components/chat/Thread';
import { EmptyState, MessageIcon, ResizeHandle } from '@/components/ui';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Inbox and outbox as one chat: conversations on the left, the open thread on
 * the right. Below the lg breakpoint only one pane shows at a time and the
 * thread header carries a back button.
 */
export default function Chats() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const params = useParams<{ phone?: string }>();
  const isNew = useMatch('/chats/new') !== null;
  const phone = params.phone ? normalizePhone(params.phone) : undefined;

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const conversations = useConversations(search);
  const detailOpen = isNew || phone !== undefined;
  // From lg up the list and the thread sit side by side, split by a handle.
  const listPanel = useResizablePanel({
    storageKey: 'sms-gateway.chat-list',
    min: 280,
    max: 560,
    defaultWidth: 384,
  });
  const backToList = () => navigate('/chats');

  return (
    <div
      className={cn('flex h-full min-h-0', listPanel.dragging && 'cursor-col-resize select-none')}
    >
      <div
        style={{ '--list-w': `${listPanel.width}px` } as CSSProperties}
        className={cn(
          detailOpen ? 'hidden lg:flex' : 'flex',
          'relative w-full min-w-0 flex-col lg:w-[var(--list-w)] lg:shrink-0 lg:border-r lg:border-border',
        )}
      >
        <ConversationList
          items={conversations.items}
          total={conversations.total}
          loading={conversations.loading}
          loadingMore={conversations.loadingMore}
          error={conversations.error}
          hasMore={conversations.hasMore}
          activePhone={phone}
          search={searchInput}
          onSearchChange={setSearchInput}
          onLoadMore={conversations.loadMore}
        />
        <ResizeHandle
          label={t('chat.resizeList')}
          dragging={listPanel.dragging}
          {...listPanel.handleProps}
          className="hidden lg:block"
        />
      </div>

      <section className={cn(detailOpen ? 'flex' : 'hidden lg:flex', 'min-w-0 flex-1 flex-col')}>
        {isNew ? (
          <NewConversation onBack={backToList} />
        ) : phone ? (
          <Thread
            key={phone}
            phone={phone}
            onBack={backToList}
            onDeleted={() => {
              conversations.removeLocal(phone);
              backToList();
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-app">
            <EmptyState
              icon={<MessageIcon className="h-6 w-6" />}
              title={t('chat.noSelection')}
              description={t('chat.noSelectionHint')}
            />
          </div>
        )}
      </section>
    </div>
  );
}
