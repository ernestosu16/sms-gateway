import { useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import { copyToClipboard } from '@/lib/clipboard';
import Pagination from '@/components/Pagination';
import WebhookDocs from '@/components/WebhookDocs';
import { usePaginatedList } from '@/lib/usePaginatedList';

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

const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-[#586e75] dark:bg-[#002b36] dark:text-[#eee8d5] dark:focus:border-[#268bd2] dark:focus:ring-[#268bd2]';
const labelClass = 'mb-1 block text-sm font-medium text-gray-700 dark:text-[#93a1a1]';
const linkButtonClass =
  'text-xs text-blue-600 hover:text-blue-800 dark:text-[#268bd2] dark:hover:text-[#2aa5f5]';
const secondaryButtonClass =
  'rounded bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-[#586e75] dark:text-[#eee8d5] dark:hover:bg-[#657b83]';
const dangerButtonClass =
  'rounded bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:bg-[#3b1f23] dark:text-[#dc322f] dark:hover:bg-[#4a262b]';

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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Webhooks() {
  const { user } = useAuth();

  // Checked before mounting the manager so non-admins never hit the admin-only API.
  if (!user?.is_admin) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-[#fdf6e3]">Webhooks</h1>
        <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-[#3b1f23] dark:text-[#dc322f]">
          You do not have permission to view this page. Admin access is required.
        </div>
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

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-[#fdf6e3]">Webhooks</h1>
      <p className="mt-1 text-sm text-gray-600 dark:text-[#93a1a1]">
        Get notified in real time when messages arrive or finish sending. Each delivery is a JSON
        POST signed with the webhook&apos;s secret in the{' '}
        <code className="font-mono text-xs">X-Webhook-Signature</code> header.{' '}
        <a
          href="#webhook-docs"
          className="font-medium text-blue-600 hover:text-blue-800 dark:text-[#268bd2] dark:hover:text-[#2aa5f5]"
        >
          See what your server receives
        </a>
      </p>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-[#3b1f23] dark:text-[#dc322f]">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-[#213a25] dark:text-[#859900]">
          {success}
        </div>
      )}

      {/* Create / edit form */}
      <div className="mt-6 rounded-lg bg-white p-4 shadow-md sm:p-6 dark:bg-[#073642] dark:ring-1 dark:ring-[#586e75]">
        <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-[#eee8d5]">
          {editing ? `Edit Webhook "${editing.name}"` : 'Create New Webhook'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="webhookName" className={labelClass}>
                Name
              </label>
              <input
                id="webhookName"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                placeholder="e.g. Alerting bot"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="webhookUrl" className={labelClass}>
                Delivery URL
              </label>
              <input
                id="webhookUrl"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                placeholder="https://example.com/sms-webhook"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="webhookSecret" className={labelClass}>
              Signing Secret
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="webhookSecret"
                type="text"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                minLength={16}
                autoComplete="off"
                spellCheck={false}
                placeholder={
                  editing ? 'Leave blank to keep the current secret' : 'Leave blank to generate one'
                }
                className={`${inputClass} min-w-0 font-mono`}
              />
              <button
                type="button"
                onClick={() => setSecret(generateSecret())}
                className="shrink-0 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-[#586e75] dark:bg-[#002b36] dark:text-[#93a1a1] dark:hover:bg-[#0a4452] dark:focus:ring-[#268bd2]"
              >
                Generate
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-[#93a1a1]">
              At least 16 characters. Used as the HMAC-SHA256 key for every delivery.
              {editing && ' Saving a new secret replaces the current one immediately.'}
            </p>
          </div>

          <fieldset>
            <legend className={labelClass}>Events</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {EVENT_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 p-3 text-sm hover:bg-gray-50 dark:border-[#586e75] dark:hover:bg-[#0a4452]"
                >
                  <input
                    type="checkbox"
                    checked={events.includes(option.value)}
                    onChange={() => toggleEvent(option.value)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-gray-800 dark:text-[#eee8d5]">
                      {option.label}
                    </span>
                    <code className="block font-mono text-xs text-gray-500 dark:text-[#93a1a1]">
                      {option.value}
                    </code>
                    <span className="mt-1 block text-xs text-gray-500 dark:text-[#93a1a1]">
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {events.length === 0 && (
              <p className="mt-1 text-xs text-red-600 dark:text-[#dc322f]">
                Select at least one event.
              </p>
            )}
          </fieldset>

          <div className="flex flex-wrap justify-end gap-2">
            {editing && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-[#586e75] dark:text-[#eee8d5] dark:hover:bg-[#657b83]"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={saving || events.length === 0}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 dark:bg-[#268bd2] dark:text-[#fdf6e3] dark:hover:bg-[#2aa5f5] dark:focus:ring-[#268bd2] dark:focus:ring-offset-[#073642]"
            >
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Webhook'}
            </button>
          </div>
        </form>
      </div>

      {/* Webhooks table */}
      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow-md dark:bg-[#073642] dark:ring-1 dark:ring-[#586e75]">
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-500 dark:text-[#93a1a1]">
            Loading webhooks...
          </div>
        ) : webhooks.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500 dark:text-[#93a1a1]">
            No webhooks yet.
          </div>
        ) : (
          <div className={refreshing ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 dark:border-[#586e75] dark:bg-[#002b36]">
                  <tr>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-[#93a1a1]">
                      Name
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-[#93a1a1]">
                      Delivery URL
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-[#93a1a1]">
                      Events
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-[#93a1a1]">
                      Signing Secret
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-[#93a1a1]">
                      Status
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-[#93a1a1]">
                      Created
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-[#93a1a1]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-[#586e75]">
                  {webhooks.map((hook) => (
                    <tr
                      key={hook.id}
                      className="align-top hover:bg-gray-50 dark:hover:bg-[#0a4452]"
                    >
                      <td className="px-4 py-4 font-medium text-gray-900 dark:text-[#eee8d5]">
                        {hook.name}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className="block max-w-[16rem] truncate font-mono text-xs text-gray-600 dark:text-[#93a1a1]"
                          title={hook.url}
                        >
                          {hook.url}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          {hook.events.map((event) => (
                            <span
                              key={event}
                              className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 font-mono text-xs text-blue-700 dark:bg-[#002b36] dark:text-[#268bd2]"
                            >
                              {event}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <code className="font-mono text-xs text-gray-600 dark:text-[#93a1a1]">
                            {revealed.has(hook.id) ? hook.secret : maskSecret(hook.secret)}
                          </code>
                          <button onClick={() => toggleReveal(hook.id)} className={linkButtonClass}>
                            {revealed.has(hook.id) ? 'Hide' : 'Show'}
                          </button>
                          <button onClick={() => handleCopy(hook)} className={linkButtonClass}>
                            {copiedId === hook.id ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {hook.is_active ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-[#213a25] dark:text-[#859900]">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-[#002b36] dark:text-[#93a1a1]">
                            Paused
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-gray-600 dark:text-[#93a1a1]">
                        {formatDate(hook.created_at)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {deleteConfirmId === hook.id ? (
                            <>
                              <span className="text-xs text-gray-600 dark:text-[#93a1a1]">
                                Delete permanently?
                              </span>
                              <button
                                onClick={() => handleDelete(hook.id)}
                                className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className={secondaryButtonClass}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(hook)}
                                className={secondaryButtonClass}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleToggleActive(hook)}
                                className={secondaryButtonClass}
                              >
                                {hook.is_active ? 'Pause' : 'Resume'}
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(hook.id)}
                                className={dangerButtonClass}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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
          </div>
        )}
      </div>

      <WebhookDocs id="webhook-docs" />
    </div>
  );
}
