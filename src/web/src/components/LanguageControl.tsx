import { useI18n, type LanguagePreference } from '@/lib/i18n';
import { cn } from '@/lib/cn';

// Language names are always written in their own language, so a user who
// cannot read the current one still finds theirs.
const NATIVE_NAMES = { en: 'English', es: 'Español' } as const;

const options: Array<{ value: LanguagePreference; short: string }> = [
  { value: 'auto', short: '' },
  { value: 'en', short: 'EN' },
  { value: 'es', short: 'ES' },
];

/** Segmented auto / English / Spanish switch; auto follows the browser language. */
export default function LanguageControl({ className }: { className?: string }) {
  const { preference, setPreference, language, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t('language.label')}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-muted p-0.5',
        className,
      )}
    >
      {options.map(({ value, short }) => {
        const label =
          value === 'auto'
            ? `${t('language.autoTitle')} (${NATIVE_NAMES[language]})`
            : NATIVE_NAMES[value];
        return (
          <button
            key={value}
            type="button"
            aria-pressed={preference === value}
            aria-label={label}
            title={label}
            onClick={() => setPreference(value)}
            className={cn(
              'inline-flex h-7 flex-1 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
              preference === value
                ? 'bg-surface text-fg shadow-sm'
                : 'text-fg-subtle hover:text-fg',
            )}
          >
            {value === 'auto' ? t('language.auto') : short}
          </button>
        );
      })}
    </div>
  );
}
