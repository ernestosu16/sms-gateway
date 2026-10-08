import { useI18n } from '@/lib/i18n';
import { useTheme, type ThemeMode } from '@/lib/theme';
import type { MessageKey } from '@/locales/en';
import { MonitorIcon, MoonIcon, SegmentedControl, SunIcon } from '@/components/ui';

const options: Array<{ value: ThemeMode; label: MessageKey; Icon: typeof SunIcon }> = [
  { value: 'light', label: 'theme.light', Icon: SunIcon },
  { value: 'dark', label: 'theme.dark', Icon: MoonIcon },
  { value: 'system', label: 'theme.system', Icon: MonitorIcon },
];

/** Segmented light / dark / system switch; withLabels adds the names beside the icons. */
export default function ThemeModeControl({
  className,
  withLabels = false,
}: {
  className?: string;
  withLabels?: boolean;
}) {
  const { themeMode, setThemeMode } = useTheme();
  const { t } = useI18n();

  return (
    <SegmentedControl
      label={t('theme.label')}
      value={themeMode}
      onChange={setThemeMode}
      className={className}
      options={options.map(({ value, label, Icon }) => ({
        value,
        label: t(label),
        content: (
          <>
            <Icon className="h-4 w-4 shrink-0" />
            {withLabels && t(label)}
          </>
        ),
      }))}
    />
  );
}
