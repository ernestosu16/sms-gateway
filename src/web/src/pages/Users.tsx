import { useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
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
      setSuccess(`User "${username.trim()}" created successfully.`);
      setUsername('');
      setPassword('');
      setIsAdmin(false);
      refresh();
    } catch {
      setActionError('Failed to create user. Username may already exist.');
    } finally {
      setCreating(false);
    }
  };

  if (!isCurrentUserAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Users" />
        <Alert>You do not have permission to view this page. Admin access is required.</Alert>
      </div>
    );
  }

  const handleDelete = async (u: UserRecord) => {
    const confirmed = await confirm({
      title: `Delete user "${u.username}"?`,
      description:
        'Their account and API keys are removed permanently. Messages they sent are kept.',
      confirmLabel: 'Delete user',
    });
    if (!confirmed) return;
    setActionError('');
    setSuccess('');
    try {
      await api.delete(`/users/${u.id}`);
      removeItems(new Set([u.id]));
      setSuccess(`User "${u.username}" deleted.`);
    } catch (err) {
      const message = isAxiosError(err) ? err.response?.data?.error : undefined;
      setActionError(typeof message === 'string' ? message : 'Failed to delete user.');
    }
  };

  const columns: Column<UserRecord>[] = [
    {
      key: 'username',
      header: 'Username',
      mobile: 'title',
      cell: (u) => (
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-fg uppercase">
            {u.username.slice(0, 1)}
          </span>
          <span className="truncate font-medium text-fg">{u.username}</span>
          {u.id === currentUser?.id && <Badge tone="primary">You</Badge>}
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      cell: (u) => (u.is_admin ? <Badge tone="accent">Admin</Badge> : <Badge>User</Badge>),
    },
    {
      key: 'created',
      header: 'Created',
      className: 'whitespace-nowrap text-fg-muted',
      cell: (u) => formatDate(u.created_at),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      mobile: 'footer',
      cell: (u) =>
        // The server refuses to delete administrators, so they get no button.
        u.is_admin ? (
          <span className="text-xs text-fg-subtle md:block md:text-right">Protected</span>
        ) : (
          <div className="md:flex md:justify-end">
            <Button variant="danger-soft" size="sm" onClick={() => handleDelete(u)}>
              Delete
            </Button>
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Manage user accounts." />

      {error && <Alert>{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      {/* Create user form */}
      <Card>
        <CardHeader title="Create New User" />
        <CardBody>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Username" htmlFor="newUsername">
                <Input
                  id="newUsername"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  placeholder="Enter username"
                />
              </Field>
              <Field label="Password" htmlFor="newPassword">
                <Input
                  id="newPassword"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Minimum 8 characters"
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
                Administrator
              </label>
              <Button type="submit" loading={creating} icon={<PlusIcon className="h-4 w-4" />}>
                {creating ? 'Creating...' : 'Create User'}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Users table */}
      <Card className="overflow-hidden">
        {loading ? (
          <LoadingState label="Loading users..." />
        ) : users.length === 0 ? (
          <EmptyState icon={<UsersIcon className="h-6 w-6" />} title="No users found." />
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
              itemLabel="Users"
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
