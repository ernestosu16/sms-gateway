import { useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiError';
import { useI18n } from '@/lib/i18n';
import Pagination from '@/components/Pagination';
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
  PlusIcon,
  UsersIcon,
  useConfirm,
  type Column,
} from '@/components/ui';

interface UserRecord {
  id: string;
  username: string;
  is_admin: boolean;
  created_at: string;
}

export default function Users() {
  const { user: currentUser } = useAuth();
  const { t } = useI18n();
  const {
    items: users,
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
  } = usePaginatedList<UserRecord>('/users');

  const { confirm, dialog } = useConfirm();
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');

  const error = actionError || loadError;

  // Create form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);

  const isCurrentUserAdmin = currentUser?.is_admin ?? false;

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setCreating(true);
    setActionError('');
    setSuccess('');

    try {
      await api.post('/users', {
        username: username.trim(),
        password: password.trim(),
        is_admin: isAdmin,
      });
      setSuccess(t('users.createdOk', { name: username.trim() }));
      setUsername('');
      setPassword('');
      setIsAdmin(false);
      refresh();
    } catch {
      setActionError(t('users.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  if (!isCurrentUserAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('nav.users')} />
        <Alert>{t('common.adminOnly')}</Alert>
      </div>
    );
  }

  const handleDelete = async (u: UserRecord) => {
    const confirmed = await confirm({
      title: t('users.deleteTitle', { name: u.username }),
      description: t('users.deleteBody'),
      confirmLabel: t('users.deleteConfirm'),
    });
    if (!confirmed) return;
    setActionError('');
    setSuccess('');
    try {
      await api.delete(`/users/${u.id}`);
      removeItems(new Set([u.id]));
      setSuccess(t('users.deleted', { name: u.username }));
    } catch (err) {
      setActionError(apiErrorMessage(err, t('users.deleteFailed')));
    }
  };

  const columns: Column<UserRecord>[] = [
    {
      key: 'username',
      header: t('common.username'),
      mobile: 'title',
      cell: (u) => (
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-fg uppercase">
            {u.username.slice(0, 1)}
          </span>
          <span className="truncate font-medium text-fg">{u.username}</span>
          {u.id === currentUser?.id && <Badge tone="primary">{t('users.you')}</Badge>}
        </span>
      ),
    },
    {
      key: 'role',
      header: t('users.role'),
      cell: (u) =>
        u.is_admin ? (
          <Badge tone="accent">{t('users.admin')}</Badge>
        ) : (
          <Badge>{t('common.user')}</Badge>
        ),
    },
    {
      key: 'created',
      header: t('common.created'),
      className: 'whitespace-nowrap text-fg-muted',
      cell: (u) => formatDate(u.created_at),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions')}</span>,
      mobile: 'footer',
      cell: (u) =>
        // The server refuses to delete administrators, so they get no button.
        u.is_admin ? (
          <span className="text-xs text-fg-subtle md:block md:text-right">
            {t('users.protected')}
          </span>
        ) : (
          <div className="md:flex md:justify-end">
            <Button variant="danger-soft" size="sm" onClick={() => handleDelete(u)}>
              {t('common.delete')}
            </Button>
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.users')} description={t('users.description')} />

      {error && <Alert>{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      {/* Create user form */}
      <Card>
        <CardHeader title={t('users.createTitle')} />
        <CardBody>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('common.username')} htmlFor="newUsername">
                <Input
                  id="newUsername"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  placeholder={t('users.usernamePlaceholder')}
                />
              </Field>
              <Field label={t('common.password')} htmlFor="newPassword">
                <Input
                  id="newPassword"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder={t('users.passwordPlaceholder')}
                />
              </Field>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <label
                htmlFor="isAdmin"
                className="flex items-center gap-2 text-sm font-medium text-fg"
              >
                <input
                  id="isAdmin"
                  type="checkbox"
                  checked={isAdmin}
                  onChange={(e) => setIsAdmin(e.target.checked)}
                />
                {t('common.administrator')}
              </label>
              <Button type="submit" loading={creating} icon={<PlusIcon className="h-4 w-4" />}>
                {creating ? t('common.creating') : t('users.create')}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Users table */}
      <Card className="overflow-hidden">
        {loading ? (
          <LoadingState label={t('users.loading')} />
        ) : users.length === 0 ? (
          <EmptyState icon={<UsersIcon className="h-6 w-6" />} title={t('users.empty')} />
        ) : (
          <>
            <DataTable
              rows={users}
              columns={columns}
              busy={refreshing}
              rowClassName={(u) => cn(u.id === currentUser?.id && 'bg-primary-soft/30')}
            />
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              totalPages={totalPages}
              busy={refreshing}
              itemLabel={t('users.items')}
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
