import { Suspense, useCallback, useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { onConversationsChanged } from '@/lib/messages';
import { usePolling } from '@/lib/usePolling';
import ThemeModeControl from '@/components/ThemeModeControl';
import {
  DashboardIcon,
  KeyIcon,
  LoadingState,
  LogoutIcon,
  MenuIcon,
  MessageIcon,
  SignalIcon,
  UsersIcon,
  WebhookIcon,
  XIcon,
} from '@/components/ui';

const navSections = [
  {
    title: 'Messaging',
    items: [
      { to: '/', label: 'Dashboard', Icon: DashboardIcon },
      { to: '/chats', label: 'Messages', Icon: MessageIcon },
    ],
  },
  {
    title: 'Settings',
    items: [
      { to: '/apikeys', label: 'API Keys', Icon: KeyIcon },
      { to: '/webhooks', label: 'Webhooks', Icon: WebhookIcon },
      { to: '/users', label: 'Users', Icon: UsersIcon },
      { to: '/modem', label: 'Modem Test', Icon: SignalIcon },
    ],
  },
];

/** Section name for the compact mobile header. */
function sectionTitle(pathname: string): string {
  if (pathname.startsWith('/chats') || pathname.startsWith('/messages/')) return 'Messages';
  for (const section of navSections) {
    const item = section.items.find((i) => i.to === pathname);
    if (item) return item.label;
  }
  return 'SMS Gateway';
}

const UNREAD_POLL_MS = 15000;

/** Total unread inbound messages, for the Messages nav badge. */
function useUnreadCount(): number {
  const [unread, setUnread] = useState(0);
  const fetchUnread = useCallback(() => {
    api
      .get<{ unread: number }>('/sms/stats')
      .then((res) => setUnread(res.data.unread))
      .catch(() => {
        // Keep the last known count; the badge is informational.
      });
  }, []);

  useEffect(() => {
    fetchUnread();
    return onConversationsChanged(fetchUnread);
  }, [fetchUnread]);
  usePolling(fetchUnread, UNREAD_POLL_MS);

  return unread;
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-fg">
        <MessageIcon className="h-4.5 w-4.5" />
      </span>
      <span className="text-base font-semibold tracking-tight text-sidebar-active-fg">
        SMS Gateway
      </span>
    </div>
  );
}

export default function Layout() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const unread = useUnreadCount();
  // The chat manages its own scrolling panes, so it fills the main area edge to
  // edge instead of sitting in the padded, scrolling page container.
  const fullBleed = pathname.startsWith('/chats');

  // The drawer is modal on phones; Escape should dismiss it like any dialog.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-dvh bg-app">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-fg transition-transform duration-200 lg:static lg:w-64 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border px-5">
          <Brand />
          <button
            className="rounded-md p-1.5 text-sidebar-fg hover:bg-sidebar-active hover:text-sidebar-active-fg lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <XIcon />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Main">
          {navSections.map((section) => (
            <div key={section.title}>
              <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider uppercase opacity-60">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map(({ to, label, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-sidebar-active text-sidebar-active-fg'
                          : 'hover:bg-sidebar-active/60 hover:text-sidebar-active-fg',
                      )
                    }
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="flex-1">{label}</span>
                    {to === '/chats' && unread > 0 && (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-fg">
                        {unread > 99 ? '99+' : unread}
                        <span className="sr-only"> unread</span>
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 space-y-3 border-t border-sidebar-border p-4">
          <ThemeModeControl className="flex w-full border-sidebar-border bg-sidebar-active/40" />
          {user && (
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-active text-sm font-semibold text-sidebar-active-fg uppercase">
                {user.username.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-sidebar-active-fg">
                  {user.username}
                </p>
                <p className="text-xs opacity-70">{user.is_admin ? 'Administrator' : 'User'}</p>
              </div>
              <button
                onClick={handleLogout}
                className="rounded-md p-2 hover:bg-sidebar-active hover:text-sidebar-active-fg"
                aria-label="Log out"
                title="Log out"
              >
                <LogoutIcon className="h-[18px] w-[18px]" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 lg:hidden">
          <button
            className="-ml-1.5 rounded-md p-1.5 text-fg-muted hover:bg-surface-hover hover:text-fg"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <MenuIcon />
          </button>
          <span className="truncate text-base font-semibold text-fg">{sectionTitle(pathname)}</span>
        </header>

        {fullBleed ? (
          <main className="min-h-0 flex-1 overflow-hidden">
            <Suspense fallback={<LoadingState label="Loading…" />}>
              <Outlet />
            </Suspense>
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
              <Suspense fallback={<LoadingState label="Loading…" />}>
                <Outlet />
              </Suspense>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
