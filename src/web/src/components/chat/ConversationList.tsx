import type { ComponentRef, UIEvent } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { formatListTime } from '@/lib/format';
import { chatPath, type Conversation } from '@/lib/messages';
import { describePhone } from '@/lib/phone';
import Avatar from '@/components/chat/Avatar';
import {
  Alert,
  AlertIcon,
  Button,
  EmptyState,
  LoadingState,
  MessageIcon,
  PlusIcon,
  SearchIcon,
} from '@/components/ui';

interface ConversationListProps {
  items: Conversation[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string;
  hasMore: boolean;
  activePhone?: string;
  search: string;
  onSearchChange: (value: string) => void;
  onLoadMore: () => void;
}

// How close to the end of the list, in px, starts loading the next batch.
const LOAD_MORE_PX = 200;

function Preview({ message }: { message: Conversation['last_message'] }) {
  if (message.direction === 'outbound' && message.status === 'failed') {
    return (
      <span className="flex min-w-0 items-center gap-1 text-danger">
        <AlertIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Not sent: {message.body}</span>
      </span>
    );
  }
  return (
    <span className="truncate">
      {message.direction === 'outbound' && <span className="text-fg-subtle">You: </span>}
      {message.body}
    </span>
  );
}

export default function ConversationList({
  items,
  total,
  loading,
  loadingMore,
  error,
  hasMore,
  activePhone,
  search,
  onSearchChange,
  onLoadMore,
}: ConversationListProps) {
  const handleScroll = (e: UIEvent<ComponentRef<'div'>>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < LOAD_MORE_PX) onLoadMore();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="shrink-0 space-y-3 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-fg">Messages</h1>
            {total > 0 && <span className="text-xs text-fg-subtle">{total.toLocaleString()}</span>}
          </div>
          <Link
            to="/chats/new"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-fg shadow-sm transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
          >
            <PlusIcon className="h-4 w-4" />
            New message
          </Link>
        </div>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <label htmlFor="conversation-search" className="sr-only">
            Search conversations
          </label>
          <input
            id="conversation-search"
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search numbers or messages"
            className="block h-9 w-full rounded-lg border border-border-strong bg-field pr-3 pl-9 text-sm text-fg placeholder:text-fg-subtle focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
          />
        </div>
      </div>

      {error && <Alert className="m-3">{error}</Alert>}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" onScroll={handleScroll}>
        {loading ? (
          <LoadingState label="Loading conversations…" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<MessageIcon className="h-6 w-6" />}
            title={search ? 'No matching conversations' : 'No conversations yet'}
            description={search ? undefined : 'Received and sent messages will show up here.'}
          />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((c) => {
              const unread = c.unread_count > 0;
              const active = c.phone_number === activePhone;
              return (
                <li key={c.phone_number}>
                  <Link
                    to={chatPath(c.phone_number)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 transition-colors focus-visible:bg-surface-hover focus-visible:outline-none',
                      active ? 'bg-primary-soft' : 'hover:bg-surface-hover',
                    )}
                  >
                    <Avatar phone={c.phone_number} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn(
                            'truncate text-sm text-fg',
                            unread ? 'font-semibold' : 'font-medium',
                          )}
                        >
                          {describePhone(c.phone_number).formatted}
                        </span>
                        <time
                          dateTime={c.last_message.created_at}
                          className={cn(
                            'shrink-0 text-xs',
                            unread ? 'font-semibold text-primary' : 'text-fg-subtle',
                          )}
                        >
                          {formatListTime(c.last_message.created_at)}
                        </time>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'flex min-w-0 text-sm',
                            unread ? 'font-medium text-fg' : 'text-fg-muted',
                          )}
                        >
                          <Preview message={c.last_message} />
                        </span>
                        {unread && (
                          <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-fg">
                            {c.unread_count}
                            <span className="sr-only"> unread</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {hasMore && !loading && (
          <div className="flex justify-center py-3">
            <Button variant="ghost" size="sm" onClick={onLoadMore} loading={loadingMore}>
              Load more
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
