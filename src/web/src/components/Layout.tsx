import { Suspense, useEffect, useState, type CSSProperties } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n';
import { formatNumber } from '@/lib/format';
import type { MessageKey } from '@/locales/en';
import { useMessageStats } from '@/lib/messageActivity';
import { useResizablePanel } from '@/lib/useResizablePanel';
import PreferencesMenu from '@/components/PreferencesMenu';
import {
  ContactIcon,
  DashboardIcon,
  GlobeIcon,
  KeyIcon,
  LoadingState,
  LogoutIcon,
  MenuIcon,
  MessageIcon,
  ResizeHandle,
  SidebarIcon,
  SignalIcon,
  SlidersIcon,
  UsersIcon,
  WebhookIcon,
  XIcon,
} from '@/components/ui';

const navSections: {
  title: MessageKey;
  items: { to: string; label: MessageKey; Icon: typeof DashboardIcon }[];
}[] = [
  {
    title: 'nav.messaging',
    items: [
      { to: '/', label: 'nav.dashboard', Icon: DashboardIcon },
      { to: '/chats', label: 'nav.messages', Icon: MessageIcon },
      { to: '/contacts', label: 'nav.contacts', Icon: ContactIcon },
    ],
  },
  {
    title: 'nav.settings',
    items: [
      { to: '/apikeys', label: 'nav.apiKeys', Icon: KeyIcon },
      { to: '/webhooks', label: 'nav.webhooks', Icon: WebhookIcon },
      { to: '/users', label: 'nav.users', Icon: UsersIcon },
      { to: '/send-policy', label: 'nav.sendPolicy', Icon: GlobeIcon },
      { to: '/modem', label: 'nav.modemTest', Icon: SignalIcon },
      { to: '/modem-setup', label: 'nav.modemSetup', Icon: SlidersIcon },
    ],
  },
];

/** Section name for the compact mobile header. */
function sectionTitle(pathname: string): MessageKey {
  if (pathname.startsWith('/chats') || pathname.startsWith('/messages/')) return 'nav.messages';
  for (const section of navSections) {
    const item = section.items.find((i) => i.to === pathname);
    if (item) return item.label;
  }
  return 'common.appName';
}

function formatUnread(unread: number): string {
  return unread > 99 ? `${formatNumber(99)}+` : formatNumber(unread);
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
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebar = useResizablePanel({
    storageKey: 'sms-gateway.sidebar',
    min: 200,
    max: 400,
    defaultWidth: 256,
    collapsedWidth: 72,
  });
  const unread = useMessageStats()?.unread ?? 0;
  // The chat manages its own scrolling panes, so it fills the main area edge to
  // edge instead of sitting in the padded, scrolling page container.
  const fullBleed = pathname.startsWith('/chats');
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
            aria-label={rail ? t('nav.expand') : t('nav.collapse')}
            aria-expanded={!rail}
            title={rail ? t('nav.expand') : t('nav.collapse')}
          >
            <SidebarIcon className="h-[18px] w-[18px]" />
          </button>
          <button
            className="rounded-md p-1.5 text-sidebar-fg hover:bg-sidebar-active hover:text-sidebar-active-fg lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label={t('nav.close')}
          >
            <XIcon />
          </button>
        </div>

        <nav
          className={cn(
            'flex-1 space-y-6 overflow-x-hidden overflow-y-auto px-3 py-5',
            rail && 'lg:px-2',
          )}
          aria-label={t('nav.main')}
        >
          {navSections.map((section, index) => (
            <div key={section.title}>
              <p
                className={cn(
                  'truncate px-3 pb-2 text-[11px] font-semibold tracking-wider uppercase opacity-60',
                  rail && 'lg:hidden',
                )}
              >
                {t(section.title)}
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
                    title={rail ? t(label) : undefined}
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
                    <span className="relative shrink-0">
                      <Icon className="h-[18px] w-[18px]" />
                      {/* On the icon rail the count has no room, so a dot stands in for it. */}
                      {rail && to === '/chats' && unread > 0 && (
                        <span
                          className="absolute -top-1 -right-1 hidden h-2 w-2 rounded-full bg-primary ring-2 ring-sidebar lg:block"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    <span className={cn('flex-1 truncate', rail && 'lg:sr-only')}>{t(label)}</span>
                    {to === '/chats' && unread > 0 && (
                      <span
                        className={cn(
                          'inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-fg',
                          rail && 'lg:sr-only',
                        )}
                      >
                        {formatUnread(unread)}
                        <span className="sr-only"> {t('common.unread')}</span>
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* relative: the preferences panel opens against this footer. */}
        <div
          className={cn(
            'relative flex shrink-0 items-center gap-2 border-t border-sidebar-border p-4',
            rail && 'lg:flex-col lg:gap-2 lg:px-2',
          )}
        >
          {user && (
            <>
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
                <p className="truncate text-xs opacity-70">
                  {user.is_admin ? t('common.administrator') : t('common.user')}
                </p>
              </div>
            </>
          )}
          <div className={cn('flex shrink-0 items-center', rail && 'lg:flex-col lg:gap-1')}>
            <PreferencesMenu
              className="rounded-md p-1.5 hover:bg-sidebar-active hover:text-sidebar-active-fg aria-expanded:bg-sidebar-active aria-expanded:text-sidebar-active-fg"
              panelClassName={cn(
                // A fixed width keeps the options readable even when the
                // sidebar is dragged to its narrowest; it may overlap the page.
                'bottom-full left-3 mb-2 w-64 max-w-[calc(100vw-1.5rem)]',
                rail && 'lg:bottom-3 lg:left-full lg:mb-0 lg:ml-2',
              )}
            />
            <button
              onClick={handleLogout}
              className="rounded-md p-1.5 hover:bg-sidebar-active hover:text-sidebar-active-fg"
              aria-label={t('nav.logout')}
              title={t('nav.logout')}
            >
              <LogoutIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>

        {/* Drag to resize, past the minimum to collapse, double-click to reset. */}
        <ResizeHandle
          label={t('nav.resize')}
          dragging={sidebar.dragging}
          {...sidebar.handleProps}
          className="hidden lg:block"
        />
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 lg:hidden">
          <button
            className="relative -ml-1.5 rounded-md p-1.5 text-fg-muted hover:bg-surface-hover hover:text-fg"
            onClick={() => setSidebarOpen(true)}
            aria-label={unread > 0 ? t('nav.openUnread', { count: unread }) : t('nav.open')}
          >
            <MenuIcon />
            {/* The sidebar badge is hidden in the closed drawer, so phones show it here. */}
            {unread > 0 && (
              <span
                className="absolute -top-0.5 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-fg"
                aria-hidden="true"
              >
                {formatUnread(unread)}
              </span>
            )}
          </button>
          <span className="truncate text-base font-semibold text-fg">
            {t(sectionTitle(pathname))}
          </span>
        </header>

        {fullBleed ? (
          <main className="min-h-0 flex-1 overflow-hidden">
            <Suspense fallback={<LoadingState label={t('common.loading')} />}>
              <Outlet />
            </Suspense>
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
              <Suspense fallback={<LoadingState label={t('common.loading')} />}>
                <Outlet />
              </Suspense>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
