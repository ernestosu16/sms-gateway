import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/format';
import Pagination from '@/components/Pagination';
import { usePaginatedList, type Message } from '@/lib/usePaginatedList';
import {
  Alert,
  Button,
  Card,
  DataTable,
  EmptyState,
  LoadingState,
  MessageStatusBadge,
  PageHeader,
  TrashIcon,
  useConfirm,
  type Column,
} from '@/components/ui';

interface MailboxProps {
  title: string;
  path: string;
  params?: Record<string, string>;
  /** Header for the phone number column: who the message came from or went to. */
  phoneLabel: string;
  emptyIcon: ReactNode;
  emptyText: string;
  /** Emphasize messages that have not been read yet (inbound only). */
  highlightUnread?: boolean;
}

/** Paged, selectable message list shared by the inbox and the outbox. */
export default function Mailbox({
  title,
  path,
  params,
  phoneLabel,
  emptyIcon,
  emptyText,
  highlightUnread = false,
}: MailboxProps) {
  const navigate = useNavigate();
  const {
    items: messages,
    total,
    page,
    pageSize,
    totalPages,
    loading,
    refreshing,
    error: loadError,
    setPage,
    setPageSize,
    removeItems,
  } = usePaginatedList<Message>(path, params);

  const { confirm, dialog } = useConfirm();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const error = deleteError || loadError;

  // Selection is scoped to the visible page, so leaving the page must clear it —
  // otherwise Delete would act on rows the user can no longer see.
  useEffect(() => {
    setSelected(new Set());
  }, [page, pageSize]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === messages.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(messages.map((m) => m.id)));
    }
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    const count = `${selected.size} message${selected.size !== 1 ? 's' : ''}`;
    const confirmed = await confirm({
      title: `Delete ${count}?`,
      description: 'This permanently removes them from the gateway and cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    setDeleting(true);
    setDeleteError('');
    const deleted = new Set<string>();
    try {
      // Deletes run concurrently; sequential awaits made bulk deletes take one
      // round trip per message.
      const results = await Promise.allSettled(
        [...selected].map((id) => api.delete(`/sms/${id}`).then(() => id)),
      );
      for (const result of results) {
        if (result.status === 'fulfilled') deleted.add(result.value);
      }
      if (deleted.size !== selected.size) {
        setDeleteError('Failed to delete some messages.');
      }
    } finally {
      removeItems(deleted);
      setSelected((prev) => {
        const next = new Set(prev);
        deleted.forEach((id) => next.delete(id));
        return next;
      });
      setDeleting(false);
    }
  };

  const isUnread = (msg: Message) => highlightUnread && msg.status === 'received';

  const columns: Column<Message>[] = [
    {
      key: 'phone',
      header: phoneLabel,
      mobile: 'title',
      className: 'whitespace-nowrap',
      cell: (msg) => (
        <span className={isUnread(msg) ? 'font-semibold text-fg' : 'font-medium text-fg'}>
          {msg.phone_number}
        </span>
      ),
    },
    {
      key: 'body',
      header: 'Message',
      mobile: 'body',
      className: 'w-full max-w-0 truncate',
      cell: (msg) => (
        <span className={isUnread(msg) ? 'font-medium text-fg' : 'text-fg-muted'}>{msg.body}</span>
      ),
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        meta={total > 0 && `${total.toLocaleString()} message${total !== 1 ? 's' : ''}`}
        actions={
          selected.size > 0 && (
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              loading={deleting}
              icon={<TrashIcon className="h-4 w-4" />}
            >
              {deleting ? 'Deleting...' : `Delete (${selected.size})`}
            </Button>
          )
        }
      />

      {error && <Alert>{error}</Alert>}

      <Card className="overflow-hidden">
        {loading ? (
          <LoadingState label={`Loading ${title.toLowerCase()}...`} />
        ) : messages.length === 0 ? (
          <EmptyState icon={emptyIcon} title="No messages" description={emptyText} />
        ) : (
          <>
            <DataTable
              rows={messages}
              columns={columns}
              busy={refreshing}
              onRowClick={(msg) => navigate(`/messages/${msg.id}`)}
              rowClassName={(msg) => cn(isUnread(msg) && 'bg-primary-soft/40')}
              selection={{
                selected,
                onToggle: toggleSelect,
                onToggleAll: toggleAll,
                label: 'Select all messages on this page',
              }}
            />
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              totalPages={totalPages}
              busy={refreshing}
              itemLabel="Messages"
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </Card>

      {dialog}
    </div>
  );
}
