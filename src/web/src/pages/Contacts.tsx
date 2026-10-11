import { useEffect, useMemo, useRef, useState, type ComponentRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import api from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiError';
import { useI18n } from '@/lib/i18n';
import {
  chatPath,
  isDialable,
  MAX_CONTACT_NAME,
  notifyConversationsChanged,
  type Contact,
} from '@/lib/messages';
import { describePhone } from '@/lib/phone';
import { formatDate, formatNumber } from '@/lib/format';
import { usePaginatedList } from '@/lib/usePaginatedList';
import Avatar from '@/components/chat/Avatar';
import Pagination from '@/components/Pagination';
import PhoneInput from '@/components/PhoneInput';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  ContactIcon,
  DataTable,
  EmptyState,
  Field,
  Input,
  LoadingState,
  MessageIcon,
  PageHeader,
  PlusIcon,
  SearchIcon,
  useConfirm,
  type Column,
} from '@/components/ui';

const SEARCH_DEBOUNCE_MS = 300;

type ContactRow = Contact & { id: string };

function contactId(contact: Contact): string {
  return contact.phone_number;
}

/** Looks up the saved contact for exactly this number, if any. */
async function findContact(phone: string): Promise<Contact | undefined> {
  // q matches by substring, so pick the exact number out of the results.
  const res = await api.get<Contact[]>('/contacts', { params: { q: phone } });
  return res.data.find((c) => c.phone_number === phone);
}

export default function Contacts() {
  const { t } = useI18n();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const {
    items: contacts,
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
  } = usePaginatedList<Contact>('/contacts', search ? { q: search } : undefined, contactId);

  // A new search starts from its first page.
  useEffect(() => setPage(1), [search, setPage]);

  const rows = useMemo<ContactRow[]>(
    () => contacts.map((c) => ({ ...c, id: contactId(c) })),
    [contacts],
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<ComponentRef<'input'>>(null);

  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const { confirm, dialog } = useConfirm();

  const error = actionError || loadError;

  const clearMessages = () => {
    setActionError('');
    setSuccess('');
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setPhone('');
    setName('');
    setPhoneError('');
  };

  const startCreate = () => {
    closeForm();
    clearMessages();
    setFormOpen(true);
  };

  const startEdit = (contact: Contact) => {
    clearMessages();
    setPhoneError('');
    setEditing(contact);
    setPhone(contact.phone_number);
    setName(contact.name);
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Wait for the form to mount before focusing it.
    window.setTimeout(() => nameRef.current?.focus(), 0);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    // PhoneInput already keeps the value as "+" and digits only.
    if (!editing && !isDialable(phone)) {
      setPhoneError(t('phone.formatHint'));
      return;
    }

    setSaving(true);
    clearMessages();
    try {
      // Saving is an upsert, so check first rather than silently renaming a
      // number that already has a contact.
      if (!editing) {
        const existing = await findContact(phone);
        if (existing) {
          const confirmed = await confirm({
            title: t('contacts.renameTitle', { name: existing.name }),
            description: t('contacts.renameBody', {
              phone: describePhone(phone).formatted,
              name: existing.name,
              newName: trimmed,
            }),
            confirmLabel: t('contacts.rename'),
          });
          if (!confirmed) return;
        }
      }
      const res = await api.put<Contact>('/contacts', { name: trimmed }, { params: { phone } });
      setSuccess(t(editing ? 'contacts.updated' : 'contacts.saved', { name: res.data.name }));
      closeForm();
      refresh();
      notifyConversationsChanged();
    } catch (err) {
      setActionError(apiErrorMessage(err, t('contacts.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contact: Contact) => {
    const confirmed = await confirm({
      title: t('contacts.deleteTitle', { name: contact.name }),
      description: t('contacts.deleteBody'),
      confirmLabel: t('common.delete'),
    });
    if (!confirmed) return;
    clearMessages();
    try {
      await api.delete('/contacts', { params: { phone: contact.phone_number } });
      if (editing?.phone_number === contact.phone_number) closeForm();
      removeItems(new Set([contactId(contact)]));
      notifyConversationsChanged();
    } catch (err) {
      // Someone else already removed it; the refetch drops the stale row.
      if (isAxiosError(err) && err.response?.status === 404) {
        refresh();
        return;
      }
      setActionError(apiErrorMessage(err, t('contacts.deleteFailed')));
    }
  };

  const columns: Column<ContactRow>[] = [
    {
      key: 'name',
      header: t('common.name'),
      mobile: 'title',
      cell: (c) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar phone={c.phone_number} name={c.name} size="sm" />
          <span className="truncate font-medium text-fg">{c.name}</span>
        </div>
      ),
    },
    {
      key: 'phone',
      header: t('common.number'),
      mobile: 'body',
      cell: (c) => {
        const details = describePhone(c.phone_number);
        return (
          <span className="block min-w-0">
            <span className="font-mono text-xs whitespace-nowrap text-fg">{details.formatted}</span>
            {details.countryName && (
              <span className="block text-xs text-fg-subtle">{details.countryName}</span>
            )}
          </span>
        );
      },
    },
    {
      key: 'updated',
      header: t('contacts.updatedColumn'),
      className: 'text-fg-muted whitespace-nowrap',
      cell: (c) => formatDate(c.updated_at),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions')}</span>,
      mobile: 'footer',
      cell: (c) => (
        <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-end">
          <Link
            to={chatPath(c.phone_number)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 text-xs font-medium text-fg shadow-sm transition-colors hover:bg-surface-hover"
          >
            <MessageIcon className="h-3.5 w-3.5" />
            {t('common.message')}
          </Link>
          <Button variant="secondary" size="sm" onClick={() => startEdit(c)}>
            {t('common.edit')}
          </Button>
          <Button variant="danger-soft" size="sm" onClick={() => handleDelete(c)}>
            {t('common.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.contacts')}
        meta={total > 0 ? formatNumber(total) : undefined}
        description={t('contacts.description')}
        actions={
          !formOpen && (
            <Button icon={<PlusIcon className="h-4 w-4" />} onClick={startCreate}>
              {t('contacts.new')}
            </Button>
          )
        }
      />

      {error && <Alert>{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      {formOpen && (
        <Card>
          <CardHeader
            title={editing ? t('contacts.edit', { name: editing.name }) : t('contacts.new')}
          />
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {editing ? (
                  <Field label={t('common.number')} htmlFor="contactPhone">
                    <Input
                      id="contactPhone"
                      value={describePhone(editing.phone_number).formatted}
                      disabled
                    />
                  </Field>
                ) : (
                  <Field
                    label={t('common.number')}
                    htmlFor="contactPhone"
                    error={phoneError || undefined}
                  >
                    <PhoneInput
                      id="contactPhone"
                      value={phone}
                      onChange={(value) => {
                        setPhone(value);
                        setPhoneError('');
                      }}
                      required
                      autoFocus
                      aria-invalid={phoneError !== ''}
                    />
                  </Field>
                )}
                <Field label={t('common.name')} htmlFor="contactName">
                  <Input
                    id="contactName"
                    ref={nameRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={MAX_CONTACT_NAME}
                    placeholder={t('contacts.namePlaceholder')}
                    autoComplete="off"
                  />
                </Field>
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={closeForm}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={!name.trim()} loading={saving}>
                  {saving
                    ? t('common.saving')
                    : editing
                      ? t('common.saveChanges')
                      : t('contacts.save')}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <label htmlFor="contactSearch" className="sr-only">
            {t('contacts.search')}
          </label>
          <div className="relative sm:max-w-sm">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              id="contactSearch"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('contacts.searchPlaceholder')}
              className="pl-9"
            />
          </div>
        </div>

        {loading ? (
          <LoadingState label={t('contacts.loading')} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ContactIcon className="h-6 w-6" />}
            title={search ? t('contacts.noMatches') : t('contacts.empty')}
          />
        ) : (
          <>
            <DataTable rows={rows} columns={columns} busy={refreshing} breakpoint="lg" />
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              totalPages={totalPages}
              busy={refreshing}
              itemLabel={t('contacts.items')}
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
