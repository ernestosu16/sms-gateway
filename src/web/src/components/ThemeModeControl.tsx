import { useTheme, type ThemeMode } from '@/lib/theme';
import { cn } from '@/lib/cn';
import { MonitorIcon, MoonIcon, SunIcon } from '@/components/ui';

const options: Array<{ value: ThemeMode; label: string; Icon: typeof SunIcon }> = [
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
  { value: 'system', label: 'System', Icon: MonitorIcon },
];

/** Segmented light / dark / system switch. */
export default function ThemeModeControl({ className }: { className?: string }) {
  const { themeMode, setThemeMode } = useTheme();

  return (
    <div
      role="group"
      aria-label="Theme mode"
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
          aria-label={label}
          title={label}
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
