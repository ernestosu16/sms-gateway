import { useI18n } from '@/lib/i18n';
import { useTheme, type ThemeMode } from '@/lib/theme';
import type { MessageKey } from '@/locales/en';
import { cn } from '@/lib/cn';
import { MonitorIcon, MoonIcon, SunIcon } from '@/components/ui';

const options: Array<{ value: ThemeMode; label: MessageKey; Icon: typeof SunIcon }> = [
  { value: 'light', label: 'theme.light', Icon: SunIcon },
  { value: 'dark', label: 'theme.dark', Icon: MoonIcon },
  { value: 'system', label: 'theme.system', Icon: MonitorIcon },
];

/** Segmented light / dark / system switch. */
export default function ThemeModeControl({ className }: { className?: string }) {
  const { themeMode, setThemeMode } = useTheme();
  const { t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t('theme.label')}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-muted p-0.5',
        className,
      )}
    >
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={themeMode === value}
          aria-label={t(label)}
          title={t(label)}
          onClick={() => setThemeMode(value)}
          className={cn(
            'inline-flex h-7 flex-1 items-center justify-center rounded-md px-2 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
            themeMode === value ? 'bg-surface text-fg shadow-sm' : 'text-fg-subtle hover:text-fg',
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
