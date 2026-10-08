import { useState, type FormEvent } from 'react';
import api from '@/lib/api';
import Pagination from '@/components/Pagination';
import { usePaginatedList } from '@/lib/usePaginatedList';
import { copyToClipboard } from '@/lib/clipboard';
import { formatDate } from '@/lib/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckIcon,
  ConfirmInline,
  CopyIcon,
  DataTable,
  EmptyState,
  Field,
  Input,
  KeyIcon,
  LoadingState,
  PageHeader,
  PlusIcon,
  type Column,
} from '@/components/ui';

interface APIKey {
  id: string;
  label: string;
  is_active: boolean;
  created_at: string;
}

export default function APIKeys() {
  const {
    items: keys,
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
    refresh,
  } = usePaginatedList<APIKey>('/apikeys');

  const [actionError, setActionError] = useState('');
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const error = actionError || loadError;

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    setCreating(true);
    setActionError('');
    try {
      const response = await api.post('/apikeys', { label: label.trim() });
      setNewKey(response.data.api_key.key);
      setLabel('');
      refresh();
    } catch {
      setActionError('Failed to create API key.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await api.delete(`/apikeys/${id}`);
      setConfirmId(null);
      refresh();
    } catch {
      setActionError('Failed to deactivate API key.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/apikeys/${id}/delete`);
      setDeleteConfirmId(null);
      removeItems(new Set([id]));
    } catch {
      setActionError('Failed to delete API key.');
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await copyToClipboard(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError('Failed to copy to clipboard.');
    }
  };

  const columns: Column<APIKey>[] = [
    {
      key: 'label',
      header: 'Label',
      mobile: 'title',
      className: 'font-medium text-fg',
      cell: (k) => k.label,
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'title',
      cell: (k) =>
        k.is_active ? (
          <Badge tone="success" dot>
            Active
          </Badge>
        ) : (
          <Badge dot>Inactive</Badge>
        ),
    },
    {
      key: 'created',
      header: 'Created',
      className: 'whitespace-nowrap text-fg-muted',
      cell: (k) => formatDate(k.created_at),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      mobile: 'footer',
      className: 'text-right',
      cell: (k) =>
        confirmId === k.id ? (
          <ConfirmInline
            prompt="Deactivate?"
            onConfirm={() => handleDeactivate(k.id)}
            onCancel={() => setConfirmId(null)}
          />
        ) : deleteConfirmId === k.id ? (
          <ConfirmInline
            prompt="Delete permanently?"
            onConfirm={() => handleDelete(k.id)}
            onCancel={() => setDeleteConfirmId(null)}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {k.is_active && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setConfirmId(k.id);
                  setDeleteConfirmId(null);
                }}
              >
                Deactivate
              </Button>
            )}
            <Button
              variant="danger-soft"
              size="sm"
              onClick={() => {
                setDeleteConfirmId(k.id);
                setConfirmId(null);
              }}
            >
              Delete
            </Button>
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="API Keys" description="Manage API keys for programmatic access." />

      {error && <Alert>{error}</Alert>}

      {/* New key reveal banner */}
      {newKey && (
        <Alert tone="warning">
          <p className="font-semibold">
            Your new API key has been created. Copy it now -- it will not be shown again.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 rounded-lg border border-border bg-field px-3 py-2 font-mono text-sm break-all text-fg">
              {newKey}
            </code>
            <Button
              onClick={() => handleCopy(newKey)}
              icon={copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
            >
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setNewKey(null)}
            className="mt-2 text-sm underline underline-offset-2 hover:opacity-80"
          >
            Dismiss
          </button>
        </Alert>
      )}

      {/* Create form */}
      <Card>
        <CardHeader title="Create New API Key" />
        <CardBody>
          <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Label" htmlFor="keyLabel" className="flex-1">
              <Input
                id="keyLabel"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                placeholder="e.g. Production Server"
              />
            </Field>
            <Button type="submit" loading={creating} icon={<PlusIcon className="h-4 w-4" />}>
              {creating ? 'Creating...' : 'Create Key'}
            </Button>
          </form>
        </CardBody>
      </Card>

      {/* Keys table */}
      <Card className="overflow-hidden">
        {loading ? (
          <LoadingState label="Loading API keys..." />
        ) : keys.length === 0 ? (
          <EmptyState icon={<KeyIcon className="h-6 w-6" />} title="No API keys found." />
        ) : (
          <>
            <DataTable rows={keys} columns={columns} busy={refreshing} />
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              totalPages={totalPages}
              busy={refreshing}
              itemLabel="API keys"
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </Card>
    </div>
  );
}
