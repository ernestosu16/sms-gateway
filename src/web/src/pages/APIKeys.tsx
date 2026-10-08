import { useState, type FormEvent } from 'react';
import api from '@/lib/api';
import { useI18n } from '@/lib/i18n';
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
  CopyIcon,
  DataTable,
  EmptyState,
  Field,
  Input,
  KeyIcon,
  LoadingState,
  PageHeader,
  PlusIcon,
  useConfirm,
  type Column,
} from '@/components/ui';

interface APIKey {
  id: string;
  label: string;
  is_active: boolean;
  created_at: string;
}

export default function APIKeys() {
  const { t } = useI18n();
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
  const { confirm, dialog } = useConfirm();

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
      setActionError(t('apiKeys.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async (key: APIKey) => {
    const confirmed = await confirm({
      title: t('apiKeys.deactivateTitle', { label: key.label }),
      description: t('apiKeys.deactivateBody'),
      confirmLabel: t('apiKeys.deactivate'),
    });
    if (!confirmed) return;
    try {
      await api.delete(`/apikeys/${key.id}`);
      refresh();
    } catch {
      setActionError(t('apiKeys.deactivateFailed'));
    }
  };

  const handleDelete = async (key: APIKey) => {
    const confirmed = await confirm({
      title: t('apiKeys.deleteTitle', { label: key.label }),
      description: t('apiKeys.deleteBody'),
      confirmLabel: t('common.delete'),
    });
    if (!confirmed) return;
    try {
      await api.delete(`/apikeys/${key.id}/delete`);
      removeItems(new Set([key.id]));
    } catch {
      setActionError(t('apiKeys.deleteFailed'));
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await copyToClipboard(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError(t('common.copyFailed'));
    }
  };

  const columns: Column<APIKey>[] = [
    {
      key: 'label',
      header: t('apiKeys.label'),
      mobile: 'title',
      className: 'font-medium text-fg',
      cell: (k) => k.label,
    },
    {
      key: 'status',
      header: t('common.status'),
      mobile: 'title',
      cell: (k) =>
        k.is_active ? (
          <Badge tone="success" dot>
            {t('common.active')}
          </Badge>
        ) : (
          <Badge dot>{t('apiKeys.inactive')}</Badge>
        ),
    },
    {
      key: 'created',
      header: t('common.created'),
      className: 'whitespace-nowrap text-fg-muted',
      cell: (k) => formatDate(k.created_at),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions')}</span>,
      mobile: 'footer',
      className: 'text-right',
      cell: (k) => (
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {k.is_active && (
            <Button variant="secondary" size="sm" onClick={() => handleDeactivate(k)}>
              {t('apiKeys.deactivate')}
            </Button>
          )}
          <Button variant="danger-soft" size="sm" onClick={() => handleDelete(k)}>
            {t('common.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.apiKeys')} description={t('apiKeys.description')} />

      {error && <Alert>{error}</Alert>}

      {/* New key reveal banner */}
      {newKey && (
        <Alert tone="warning">
          <p className="font-semibold">{t('apiKeys.created')}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 rounded-lg border border-border bg-field px-3 py-2 font-mono text-sm break-all text-fg">
              {newKey}
            </code>
            <Button
              onClick={() => handleCopy(newKey)}
              icon={copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
            >
              {copied ? t('common.copied') : t('common.copy')}
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setNewKey(null)}
            className="mt-2 text-sm underline underline-offset-2 hover:opacity-80"
          >
            {t('apiKeys.dismiss')}
          </button>
        </Alert>
      )}

      {/* Create form */}
      <Card>
        <CardHeader title={t('apiKeys.createTitle')} />
        <CardBody>
          <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label={t('apiKeys.label')} htmlFor="keyLabel" className="flex-1">
              <Input
                id="keyLabel"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                placeholder={t('apiKeys.labelPlaceholder')}
              />
            </Field>
            <Button type="submit" loading={creating} icon={<PlusIcon className="h-4 w-4" />}>
              {creating ? t('common.creating') : t('apiKeys.create')}
            </Button>
          </form>
        </CardBody>
      </Card>

      {/* Keys table */}
      <Card className="overflow-hidden">
        {loading ? (
          <LoadingState label={t('apiKeys.loading')} />
        ) : keys.length === 0 ? (
          <EmptyState icon={<KeyIcon className="h-6 w-6" />} title={t('apiKeys.empty')} />
        ) : (
          <>
            <DataTable rows={keys} columns={columns} busy={refreshing} />
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              totalPages={totalPages}
              busy={refreshing}
              itemLabel={t('apiKeys.items')}
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
