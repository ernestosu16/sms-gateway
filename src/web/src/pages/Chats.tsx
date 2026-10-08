import { useEffect, useState } from 'react';
import { useMatch, useNavigate, useParams } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { normalizePhone } from '@/lib/messages';
import { useConversations } from '@/lib/useChat';
import ConversationList from '@/components/chat/ConversationList';
import NewConversation from '@/components/chat/NewConversation';
import Thread from '@/components/chat/Thread';
import { EmptyState, MessageIcon } from '@/components/ui';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Inbox and outbox as one chat: conversations on the left, the open thread on
 * the right. Below the lg breakpoint only one pane shows at a time and the
 * thread header carries a back button.
 */
export default function Chats() {
  const navigate = useNavigate();
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
  const backToList = () => navigate('/chats');

  return (
    <div className="flex h-full min-h-0">
      <div
        className={cn(
          detailOpen ? 'hidden lg:flex' : 'flex',
          'w-full min-w-0 flex-col lg:w-96 lg:shrink-0 lg:border-r lg:border-border',
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
              title="No conversation selected"
              description="Pick a conversation or start a new one."
            />
          </div>
        )}
      </section>
    </div>
  );
}
