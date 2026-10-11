import { useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiError';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/locales/en';
import { copyToClipboard } from '@/lib/clipboard';
import Pagination from '@/components/Pagination';
import WebhookDocs from '@/components/WebhookDocs';
import { usePaginatedList } from '@/lib/usePaginatedList';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  WebhookIcon,
  useConfirm,
  type Column,
} from '@/components/ui';

type WebhookEvent = 'message.received' | 'message.sent' | 'message.failed';

interface Webhook {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  is_active: boolean;
  created_at: string;
}

// Mirrors models.WebhookEvents on the server, which rejects anything else.
const EVENT_OPTIONS: { value: WebhookEvent; label: MessageKey; description: MessageKey }[] = [
  {
    value: 'message.received',
    label: 'webhooks.event.received',
    description: 'webhooks.event.receivedHint',
  },
  {
    value: 'message.sent',
    label: 'webhooks.event.sent',
    description: 'webhooks.event.sentHint',
  },
  {
    value: 'message.failed',
    label: 'webhooks.event.failed',
    description: 'webhooks.event.failedHint',
  },
];

const DEFAULT_EVENTS: WebhookEvent[] = ['message.received'];

/**
 * Builds a secret in the same shape the server generates: "whsec_" plus 32
 * random bytes as hex. getRandomValues works over plain HTTP, unlike
 * crypto.randomUUID, so this also runs on a LAN-served gateway.
 */
function generateSecret(): string {
  const bytes = window.crypto.getRandomValues(new Uint8Array(32));
  return 'whsec_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function maskSecret(secret: string) {
  if (secret.length <= 8) return '********';
  return secret.slice(0, 4) + '********' + secret.slice(-4);
}

export default function Webhooks() {
  const { user } = useAuth();
  const { t } = useI18n();

  // Checked before mounting the manager so non-admins never hit the admin-only API.
  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('nav.webhooks')} />
        <Alert>{t('common.adminOnly')}</Alert>
      </div>
    );
  }

  return <WebhookManager />;
}

function WebhookManager() {
  const { t, rich } = useI18n();
  const {
    items: webhooks,
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
  } = usePaginatedList<Webhook>('/webhooks');

  const [editing, setEditing] = useState<Webhook | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>(DEFAULT_EVENTS);
  const [saving, setSaving] = useState(false);

  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const { confirm, dialog } = useConfirm();
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const error = actionError || loadError;

  const resetForm = () => {
    setEditing(null);
    setName('');
    setUrl('');
    setSecret('');
    setEvents(DEFAULT_EVENTS);
  };

  const startEdit = (hook: Webhook) => {
    setEditing(hook);
    setName(hook.name);
    setUrl(hook.url);
    setSecret('');
    setEvents(hook.events);
    setActionError('');
    setSuccess('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleEvent = (event: WebhookEvent) => {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim() || events.length === 0) return;

    setSaving(true);
    setActionError('');
    setSuccess('');

    // An empty secret generates one on create and keeps the current one on
    // update; omitting is_active leaves a paused webhook paused.
    const payload = { name: name.trim(), url: url.trim(), secret: secret.trim(), events };
    try {
      if (editing) {
        await api.put(`/webhooks/${editing.id}`, payload);
        setSuccess(t('webhooks.updated', { name: payload.name }));
      } else {
        await api.post('/webhooks', payload);
        setSuccess(t('webhooks.createdOk', { name: payload.name }));
      }
      resetForm();
      refresh();
    } catch (err) {
      setActionError(
        apiErrorMessage(err, editing ? t('webhooks.updateFailed') : t('webhooks.createFailed')),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (hook: Webhook) => {
    setActionError('');
    setSuccess('');
    try {
      await api.put(`/webhooks/${hook.id}`, {
        name: hook.name,
        url: hook.url,
        events: hook.events,
        is_active: !hook.is_active,
      });
      refresh();
    } catch (err) {
      setActionError(apiErrorMessage(err, t('webhooks.updateFailed')));
    }
  };

  const handleDelete = async (hook: Webhook) => {
    const confirmed = await confirm({
      title: t('webhooks.deleteTitle', { name: hook.name }),
      description: t('webhooks.deleteBody'),
      confirmLabel: t('common.delete'),
    });
    if (!confirmed) return;
    setActionError('');
    setSuccess('');
    try {
      await api.delete(`/webhooks/${hook.id}`);
      if (editing?.id === hook.id) resetForm();
      removeItems(new Set([hook.id]));
    } catch (err) {
      setActionError(apiErrorMessage(err, t('webhooks.deleteFailed')));
    }
  };

  const handleCopy = async (hook: Webhook) => {
    try {
      await copyToClipboard(hook.secret);
      setCopiedId(hook.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setActionError(t('common.copyFailed'));
    }
  };

  const toggleReveal = (id: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const columns: Column<Webhook>[] = [
    {
      key: 'name',
      header: t('common.name'),
      mobile: 'title',
      className: 'font-medium whitespace-nowrap text-fg',
      cell: (hook) => hook.name,
    },
    {
      key: 'status',
      header: t('common.status'),
      mobile: 'title',
      cell: (hook) =>
        hook.is_active ? (
          <Badge tone="success" dot>
            {t('common.active')}
          </Badge>
        ) : (
          <Badge dot>{t('webhooks.paused')}</Badge>
        ),
    },
    {
      key: 'url',
      header: t('webhooks.url'),
      mobile: 'body',
      cell: (hook) => (
        <span
          className="block font-mono text-xs break-all text-fg-muted xl:max-w-[11rem] xl:truncate"
          title={hook.url}
        >
          {hook.url}
        </span>
      ),
    },
    {
      key: 'events',
      header: t('webhooks.events'),
      cell: (hook) => (
        <div className="flex flex-wrap gap-1">
          {hook.events.map((event) => (
            <Badge key={event} tone="primary" className="font-mono">
              {event}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'secret',
      header: t('webhooks.secret'),
      cell: (hook) => (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <code className="font-mono text-xs break-all text-fg-muted">
            {revealed.has(hook.id) ? hook.secret : maskSecret(hook.secret)}
          </code>
          <span className="flex gap-3">
            <Button variant="link" onClick={() => toggleReveal(hook.id)}>
              {revealed.has(hook.id) ? t('webhooks.hide') : t('webhooks.show')}
            </Button>
            <Button variant="link" onClick={() => handleCopy(hook)}>
              {copiedId === hook.id ? t('common.copied') : t('common.copy')}
            </Button>
          </span>
        </div>
      ),
    },
    {
      key: 'created',
      header: t('common.created'),
      className: 'text-fg-muted',
      cell: (hook) => formatDate(hook.created_at),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions')}</span>,
      mobile: 'footer',
      cell: (hook) => (
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <Button variant="secondary" size="sm" onClick={() => startEdit(hook)}>
            {t('common.edit')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleToggleActive(hook)}>
            {hook.is_active ? t('webhooks.pause') : t('webhooks.resume')}
          </Button>
          <Button variant="danger-soft" size="sm" onClick={() => handleDelete(hook)}>
            {t('common.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.webhooks')}
        description={rich('webhooks.description', {
          code: (chunk) => <code className="font-mono text-xs">{chunk}</code>,
          link: (chunk) => (
            <a
              href="#webhook-docs"
              className="font-medium text-primary hover:text-primary-hover hover:underline"
            >
              {chunk}
            </a>
          ),
        })}
      />

      {error && <Alert>{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      {/* Create / edit form */}
      <Card>
        <CardHeader
          title={editing ? t('webhooks.edit', { name: editing.name }) : t('webhooks.createTitle')}
        />
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('common.name')} htmlFor="webhookName">
                <Input
                  id="webhookName"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={100}
                  placeholder={t('webhooks.namePlaceholder')}
                />
              </Field>
              <Field label={t('webhooks.url')} htmlFor="webhookUrl">
                <Input
                  id="webhookUrl"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  placeholder="https://example.com/sms-webhook"
                />
              </Field>
            </div>

            <Field
              label={t('webhooks.signingSecret')}
              htmlFor="webhookSecret"
              hint={
                <>
                  {t('webhooks.secretHint')}
                  {editing && t('webhooks.secretHintEdit')}
                </>
              }
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="webhookSecret"
                  type="text"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  minLength={16}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={editing ? t('webhooks.secretKeep') : t('webhooks.secretGenerate')}
                  className="font-mono"
                />
                <Button variant="secondary" onClick={() => setSecret(generateSecret())}>
                  {t('webhooks.generate')}
                </Button>
              </div>
            </Field>

            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-fg">
                {t('webhooks.events')}
              </legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {EVENT_OPTIONS.map((option) => {
                  const checked = events.includes(option.value);
                  return (
                    <label
                      key={option.value}
                      className={cn(
                        'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm transition-colors',
                        checked
                          ? 'border-primary bg-primary-soft/40'
                          : 'border-border hover:bg-surface-hover',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleEvent(option.value)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium text-fg">{t(option.label)}</span>
                        <code className="block font-mono text-xs text-fg-subtle">
                          {option.value}
                        </code>
                        <span className="mt-1 block text-xs text-fg-muted">
                          {t(option.description)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {events.length === 0 && (
                <p className="mt-1.5 text-xs text-danger">{t('webhooks.selectEvent')}</p>
              )}
            </fieldset>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {editing && (
                <Button variant="secondary" onClick={resetForm}>
                  {t('common.cancel')}
                </Button>
              )}
              <Button type="submit" disabled={events.length === 0} loading={saving}>
                {saving
                  ? t('common.saving')
                  : editing
                    ? t('common.saveChanges')
                    : t('webhooks.create')}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Webhooks table */}
      <Card className="overflow-hidden">
        {loading ? (
          <LoadingState label={t('webhooks.loading')} />
        ) : webhooks.length === 0 ? (
          <EmptyState icon={<WebhookIcon className="h-6 w-6" />} title={t('webhooks.empty')} />
        ) : (
          <>
            <DataTable rows={webhooks} columns={columns} busy={refreshing} breakpoint="xl" />
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              totalPages={totalPages}
              busy={refreshing}
              itemLabel={t('webhooks.items')}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </Card>

      <WebhookDocs id="webhook-docs" />

      {dialog}
    </div>
  );
}
