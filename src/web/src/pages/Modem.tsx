import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/locales/en';
import { GlobeIcon, LoadingState, SignalIcon, SlidersIcon } from '@/components/ui';

const tabs: { to: string; label: MessageKey; Icon: typeof SignalIcon }[] = [
  { to: '/modem', label: 'nav.modemTest', Icon: SignalIcon },
  { to: '/modem/setup', label: 'nav.modemSetup', Icon: SlidersIcon },
  { to: '/modem/send-policy', label: 'nav.sendPolicy', Icon: GlobeIcon },
];

/** Modem section: status, carrier setup and send countries as route tabs. */
export default function Modem() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      {/* Scrolls sideways on narrow phones instead of wrapping the tabs. */}
      <nav
        aria-label={t('nav.modem')}
        className="-mx-4 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0"
      >
        <div className="flex min-w-max gap-1">
          {tabs.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                cn(
                  '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
                  isActive
                    ? 'border-primary text-fg'
                    : 'border-transparent text-fg-subtle hover:border-border hover:text-fg',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {t(label)}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Own boundary so a lazy tab keeps the tab bar on screen while loading. */}
      <Suspense fallback={<LoadingState label={t('common.loading')} />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
