import { useEffect, useState, type CSSProperties } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { SIDEBAR_MAX, SIDEBAR_MIN, useResizableSidebar } from '@/lib/useResizableSidebar';
import ThemeModeControl from '@/components/ThemeModeControl';
import {
  DashboardIcon,
  InboxIcon,
  KeyIcon,
  LogoutIcon,
  MenuIcon,
  MessageIcon,
  OutboxIcon,
  SendIcon,
  SidebarIcon,
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
      { to: '/send', label: 'Send SMS', Icon: SendIcon },
      { to: '/inbox', label: 'Inbox', Icon: InboxIcon },
      { to: '/outbox', label: 'Outbox', Icon: OutboxIcon },
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
  if (pathname.startsWith('/messages/')) return 'Message';
  for (const section of navSections) {
    const item = section.items.find((i) => i.to === pathname);
    if (item) return item.label;
  }
  return 'SMS Gateway';
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
  const sidebar = useResizableSidebar();
  // Collapsing and resizing only apply from lg up; on phones the sidebar is a
  // full-width drawer. Every collapsed style below is therefore lg: prefixed.
  const rail = sidebar.collapsed;

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
    <div className={cn('flex h-dvh bg-app', sidebar.dragging && 'cursor-col-resize select-none')}>
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
        style={{ '--sidebar-w': `${sidebar.width}px` } as CSSProperties}
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-fg transition-transform duration-200 lg:relative lg:w-[var(--sidebar-w)] lg:max-w-none lg:shrink-0 lg:translate-x-0',
          // Animate collapse and expand, but follow the pointer exactly while dragging.
          !sidebar.dragging && 'lg:transition-[width]',
          sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
        )}
      >
        <div
          className={cn(
            'flex h-16 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-5',
            rail && 'lg:justify-center lg:px-0',
          )}
        >
          <div className={cn('min-w-0', rail && 'lg:hidden')}>
            <Brand />
          </div>
          <button
            className="hidden rounded-md p-1.5 text-sidebar-fg hover:bg-sidebar-active hover:text-sidebar-active-fg lg:block"
            onClick={sidebar.toggle}
            aria-label={rail ? 'Expand navigation' : 'Collapse navigation'}
            aria-expanded={!rail}
            title={rail ? 'Expand navigation' : 'Collapse navigation'}
          >
            <SidebarIcon className="h-[18px] w-[18px]" />
          </button>
          <button
            className="rounded-md p-1.5 text-sidebar-fg hover:bg-sidebar-active hover:text-sidebar-active-fg lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <XIcon />
          </button>
        </div>

        <nav
          className={cn(
            'flex-1 space-y-6 overflow-x-hidden overflow-y-auto px-3 py-5',
            rail && 'lg:px-2',
          )}
          aria-label="Main"
        >
          {navSections.map((section, index) => (
            <div key={section.title}>
              <p
                className={cn(
                  'truncate px-3 pb-2 text-[11px] font-semibold tracking-wider uppercase opacity-60',
                  rail && 'lg:hidden',
                )}
              >
                {section.title}
              </p>
              {rail && index > 0 && (
                <div
                  className="mx-2 mb-4 hidden h-px bg-sidebar-border lg:block"
                  aria-hidden="true"
                />
              )}
              <div className="space-y-0.5">
                {section.items.map(({ to, label, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    onClick={() => setSidebarOpen(false)}
                    title={rail ? label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        rail && 'lg:justify-center lg:px-0',
                        isActive
                          ? 'bg-sidebar-active text-sidebar-active-fg'
                          : 'hover:bg-sidebar-active/60 hover:text-sidebar-active-fg',
                      )
                    }
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    <span className={cn('truncate', rail && 'lg:sr-only')}>{label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div
          className={cn(
            'shrink-0 space-y-3 border-t border-sidebar-border p-4',
            rail && 'lg:flex lg:flex-col lg:items-center lg:px-2',
          )}
        >
          <ThemeModeControl
            className={cn(
              'flex w-full border-sidebar-border bg-sidebar-active/40',
              rail && 'lg:w-auto lg:flex-col',
            )}
          />
          {user && (
            <div className={cn('flex items-center gap-3', rail && 'lg:flex-col lg:gap-2')}>
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-active text-sm font-semibold text-sidebar-active-fg uppercase"
                title={rail ? user.username : undefined}
              >
                {user.username.slice(0, 1)}
              </span>
              <div className={cn('min-w-0 flex-1', rail && 'lg:hidden')}>
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

        {/* Drag handle on the right edge: drag to resize, past the minimum to
            collapse, double-click to reset; arrow keys work when focused. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize navigation"
          aria-valuemin={SIDEBAR_MIN}
          aria-valuemax={SIDEBAR_MAX}
          aria-valuenow={sidebar.width}
          tabIndex={0}
          title="Drag to resize, double-click to reset"
          {...sidebar.handleProps}
          className="group absolute inset-y-0 -right-1.5 z-10 hidden w-3 cursor-col-resize touch-none focus-visible:outline-none lg:block"
        >
          <span
            className={cn(
              'absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors group-hover:bg-primary group-focus-visible:bg-primary',
              sidebar.dragging && 'bg-primary',
            )}
          />
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

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
