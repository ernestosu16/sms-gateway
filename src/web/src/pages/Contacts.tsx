import { useEffect, useMemo, useRef, useState, type ComponentRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import api from '@/lib/api';
import {
  chatPath,
  isDialable,
  MAX_CONTACT_NAME,
  notifyConversationsChanged,
  RECIPIENT_FORMAT_HINT,
  type Contact,
} from '@/lib/messages';
import { describePhone } from '@/lib/phone';
import { formatDate } from '@/lib/format';
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

/** Prefers the server's validation message over a generic fallback. */
function errorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

/** Looks up the saved contact for exactly this number, if any. */
async function findContact(phone: string): Promise<Contact | undefined> {
  // q matches by substring, so pick the exact number out of the results.
  const res = await api.get<Contact[]>('/contacts', { params: { q: phone } });
  return res.data.find((c) => c.phone_number === phone);
}

export default function Contacts() {
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
      setPhoneError(RECIPIENT_FORMAT_HINT);
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
            title: `Rename "${existing.name}"?`,
            description: `${describePhone(phone).formatted} is already saved as "${existing.name}". Saving replaces that name with "${trimmed}".`,
            confirmLabel: 'Rename',
          });
          if (!confirmed) return;
        }
      }
      const res = await api.put<Contact>('/contacts', { name: trimmed }, { params: { phone } });
      setSuccess(
        editing ? `Contact "${res.data.name}" updated.` : `Contact "${res.data.name}" saved.`,
      );
      closeForm();
      refresh();
      notifyConversationsChanged();
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to save contact.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contact: Contact) => {
    const confirmed = await confirm({
      title: `Delete "${contact.name}"?`,
      description:
        'The number shows without a name from now on. Its messages are kept. This cannot be undone.',
      confirmLabel: 'Delete',
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
      setActionError(errorMessage(err, 'Failed to delete contact.'));
    }
  };

  const columns: Column<ContactRow>[] = [
    {
      key: 'name',
      header: 'Name',
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
      header: 'Number',
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
      header: 'Updated',
      className: 'text-fg-muted whitespace-nowrap',
      cell: (c) => formatDate(c.updated_at),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      mobile: 'footer',
      cell: (c) => (
        <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-end">
          <Link
            to={chatPath(c.phone_number)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 text-xs font-medium text-fg shadow-sm transition-colors hover:bg-surface-hover"
          >
            <MessageIcon className="h-3.5 w-3.5" />
            Message
          </Link>
          <Button variant="secondary" size="sm" onClick={() => startEdit(c)}>
            Edit
          </Button>
          <Button variant="danger-soft" size="sm" onClick={() => handleDelete(c)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contacts"
        meta={total > 0 ? total.toLocaleString() : undefined}
        description="Names shown in place of phone numbers across your conversations. Deleting a contact keeps its messages."
        actions={
          !formOpen && (
            <Button icon={<PlusIcon className="h-4 w-4" />} onClick={startCreate}>
              New contact
            </Button>
          )
        }
      />

      {error && <Alert>{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      {formOpen && (
        <Card>
          <CardHeader title={editing ? `Edit "${editing.name}"` : 'New contact'} />
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {editing ? (
                  <Field label="Number" htmlFor="contactPhone">
                    <Input
                      id="contactPhone"
                      value={describePhone(editing.phone_number).formatted}
                      disabled
                    />
                  </Field>
                ) : (
                  <Field label="Number" htmlFor="contactPhone" error={phoneError || undefined}>
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
                <Field label="Name" htmlFor="contactName">
                  <Input
                    id="contactName"
                    ref={nameRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={MAX_CONTACT_NAME}
                    placeholder="e.g. Jane Doe"
                    autoComplete="off"
                  />
                </Field>
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={closeForm}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!name.trim()} loading={saving}>
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Save Contact'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <label htmlFor="contactSearch" className="sr-only">
            Search contacts
          </label>
          <div className="relative sm:max-w-sm">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              id="contactSearch"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name or number"
              className="pl-9"
            />
          </div>
        </div>

        {loading ? (
          <LoadingState label="Loading contacts..." />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ContactIcon className="h-6 w-6" />}
            title={search ? 'No contacts match your search.' : 'No contacts yet.'}
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
              itemLabel="contacts"
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
