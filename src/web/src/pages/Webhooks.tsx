import { useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
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
  ConfirmInline,
  DataTable,
  EmptyState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  WebhookIcon,
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
const EVENT_OPTIONS: { value: WebhookEvent; label: string; description: string }[] = [
  {
    value: 'message.received',
    label: 'Message received',
    description: 'An inbound SMS arrived.',
  },
  {
    value: 'message.sent',
    label: 'Message sent',
    description: 'The modem accepted an outbound SMS.',
  },
  {
    value: 'message.failed',
    label: 'Message failed',
    description: 'The modem rejected an outbound SMS.',
  },
];

const DEFAULT_EVENTS: WebhookEvent[] = ['message.received'];

/** Prefers the server's validation message over a generic fallback. */
function errorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

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

  // Checked before mounting the manager so non-admins never hit the admin-only API.
  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Webhooks" />
        <Alert>You do not have permission to view this page. Admin access is required.</Alert>
      </div>
    );
  }

  return <WebhookManager />;
}

function WebhookManager() {
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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
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
        setSuccess(`Webhook "${payload.name}" updated.`);
      } else {
        await api.post('/webhooks', payload);
        setSuccess(`Webhook "${payload.name}" created.`);
      }
      resetForm();
      refresh();
    } catch (err) {
      setActionError(errorMessage(err, `Failed to ${editing ? 'update' : 'create'} webhook.`));
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
      setActionError(errorMessage(err, 'Failed to update webhook.'));
    }
  };

  const handleDelete = async (id: string) => {
    setActionError('');
    setSuccess('');
    try {
      await api.delete(`/webhooks/${id}`);
      setDeleteConfirmId(null);
      if (editing?.id === id) resetForm();
      removeItems(new Set([id]));
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to delete webhook.'));
    }
  };

  const handleCopy = async (hook: Webhook) => {
    try {
      await copyToClipboard(hook.secret);
      setCopiedId(hook.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setActionError('Failed to copy to clipboard.');
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
      header: 'Name',
      mobile: 'title',
      className: 'font-medium whitespace-nowrap text-fg',
      cell: (hook) => hook.name,
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'title',
      cell: (hook) =>
        hook.is_active ? (
          <Badge tone="success" dot>
            Active
          </Badge>
        ) : (
          <Badge dot>Paused</Badge>
        ),
    },
    {
      key: 'url',
      header: 'Delivery URL',
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
      header: 'Events',
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
      header: 'Secret',
      cell: (hook) => (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <code className="font-mono text-xs break-all text-fg-muted">
            {revealed.has(hook.id) ? hook.secret : maskSecret(hook.secret)}
          </code>
          <span className="flex gap-3">
            <Button variant="link" onClick={() => toggleReveal(hook.id)}>
              {revealed.has(hook.id) ? 'Hide' : 'Show'}
            </Button>
            <Button variant="link" onClick={() => handleCopy(hook)}>
              {copiedId === hook.id ? 'Copied!' : 'Copy'}
            </Button>
          </span>
        </div>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      className: 'text-fg-muted',
      cell: (hook) => formatDate(hook.created_at),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      mobile: 'footer',
      cell: (hook) =>
        deleteConfirmId === hook.id ? (
          <ConfirmInline
            prompt="Delete permanently?"
            onConfirm={() => handleDelete(hook.id)}
            onCancel={() => setDeleteConfirmId(null)}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <Button variant="secondary" size="sm" onClick={() => startEdit(hook)}>
              Edit
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleToggleActive(hook)}>
              {hook.is_active ? 'Pause' : 'Resume'}
            </Button>
            <Button variant="danger-soft" size="sm" onClick={() => setDeleteConfirmId(hook.id)}>
              Delete
            </Button>
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description={
          <>
            Get notified in real time when messages arrive or finish sending. Each delivery is a
            JSON POST signed with the webhook&apos;s secret in the{' '}
            <code className="font-mono text-xs">X-Webhook-Signature</code> header.{' '}
            <a
              href="#webhook-docs"
              className="font-medium text-primary hover:text-primary-hover hover:underline"
            >
              See what your server receives
            </a>
          </>
        }
      />

      {error && <Alert>{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      {/* Create / edit form */}
      <Card>
        <CardHeader title={editing ? `Edit Webhook "${editing.name}"` : 'Create New Webhook'} />
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="webhookName">
                <Input
                  id="webhookName"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={100}
                  placeholder="e.g. Alerting bot"
                />
              </Field>
              <Field label="Delivery URL" htmlFor="webhookUrl">
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
              label="Signing Secret"
              htmlFor="webhookSecret"
              hint={
                <>
                  At least 16 characters. Used as the HMAC-SHA256 key for every delivery.
                  {editing && ' Saving a new secret replaces the current one immediately.'}
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
                  placeholder={
                    editing
                      ? 'Leave blank to keep the current secret'
                      : 'Leave blank to generate one'
                  }
                  className="font-mono"
                />
                <Button variant="secondary" onClick={() => setSecret(generateSecret())}>
                  Generate
                </Button>
              </div>
            </Field>

            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-fg">Events</legend>
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
                        <span className="block font-medium text-fg">{option.label}</span>
                        <code className="block font-mono text-xs text-fg-subtle">
                          {option.value}
                        </code>
                        <span className="mt-1 block text-xs text-fg-muted">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {events.length === 0 && (
                <p className="mt-1.5 text-xs text-danger">Select at least one event.</p>
              )}
            </fieldset>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {editing && (
                <Button variant="secondary" onClick={resetForm}>
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={events.length === 0} loading={saving}>
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Webhook'}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Webhooks table */}
      <Card className="overflow-hidden">
        {loading ? (
          <LoadingState label="Loading webhooks..." />
        ) : webhooks.length === 0 ? (
          <EmptyState icon={<WebhookIcon className="h-6 w-6" />} title="No webhooks yet." />
        ) : (
          <>
            <DataTable rows={webhooks} columns={columns} busy={refreshing} breakpoint="xl" />
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              totalPages={totalPages}
              busy={refreshing}
              itemLabel="webhooks"
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </Card>

      <WebhookDocs id="webhook-docs" />
    </div>
  );
}
