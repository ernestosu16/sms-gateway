import { useI18n, type LanguagePreference } from '@/lib/i18n';
import { SegmentedControl } from '@/components/ui';

// Language names are always written in their own language, so a user who
// cannot read the current one still finds theirs.
const NATIVE_NAMES = { en: 'English', es: 'Español' } as const;

/** Segmented auto / English / Spanish switch; auto follows the browser language. */
export default function LanguageControl({ className }: { className?: string }) {
  const { preference, setPreference, language, t } = useI18n();

  return (
    <SegmentedControl<LanguagePreference>
      label={t('language.label')}
      value={preference}
      onChange={setPreference}
      className={className}
      options={[
        {
          value: 'auto',
          label: `${t('language.autoTitle')} (${NATIVE_NAMES[language]})`,
          content: t('language.auto'),
        },
        { value: 'en', label: NATIVE_NAMES.en, content: 'EN' },
        { value: 'es', label: NATIVE_NAMES.es, content: 'ES' },
      ]}
    />
  );
}
