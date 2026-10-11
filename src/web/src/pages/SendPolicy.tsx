import { useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { listCountries } from '@/lib/phone';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  LoadingState,
  PageHeader,
  SearchIcon,
  SegmentedControl,
  XIcon,
} from '@/components/ui';

type SendMode = 'all' | 'none' | 'selected';

interface SendPolicyData {
  mode: SendMode;
  countries: string[];
  updated_at: string;
}

function sameSelection(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((c) => b.includes(c));
}

export default function SendPolicy() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const [saved, setSaved] = useState<SendPolicyData | null>(null);
  const [mode, setMode] = useState<SendMode>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Country names follow the UI language, so the list is rebuilt when it changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const countries = useMemo(() => listCountries(), [language]);
  const byCode = useMemo(() => new Map(countries.map((c) => [c.code as string, c])), [countries]);

  useEffect(() => {
    api
      .get<SendPolicyData>('/sms/send-policy')
      .then((res) => {
        setSaved(res.data);
        setMode(res.data.mode);
        setSelected(res.data.countries);
      })
      .catch(() => setError(t('sendPolicy.loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^\+/, '');
    if (!q) return countries;
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase() === q ||
        c.callingCode.startsWith(q),
    );
  }, [countries, search]);

  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('nav.sendPolicy')} />
        <Alert>{t('common.adminOnly')}</Alert>
      </div>
    );
  }

  if (loading) return <LoadingState label={t('common.loading')} />;

  const dirty =
    !!saved &&
    (mode !== saved.mode || (mode === 'selected' && !sameSelection(selected, saved.countries)));
  const invalid = mode === 'selected' && selected.length === 0;

  const toggle = (code: string) => {
    setSuccess('');
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.put<SendPolicyData>('/sms/send-policy', {
        mode,
        countries: mode === 'selected' ? selected : [],
      });
      setSaved(res.data);
      setMode(res.data.mode);
      // Keep the current selection when switching away from "selected", so
      // switching back does not lose it before saving.
      if (res.data.mode === 'selected') setSelected(res.data.countries);
      setSuccess(t('sendPolicy.saved'));
    } catch (err) {
      const message = isAxiosError(err) ? err.response?.data?.error : undefined;
      setError(typeof message === 'string' ? message : t('sendPolicy.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const selectedOptions = selected
    .map((code) => byCode.get(code) ?? { code, name: code, flag: '', callingCode: '' })
    .sort((a, b) => a.name.localeCompare(b.name, language));

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.sendPolicy')} description={t('sendPolicy.description')} />

      {error && <Alert>{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      <Card>
        <CardHeader
          title={t('sendPolicy.modeTitle')}
          description={t('sendPolicy.inboundNote')}
          actions={
            <Button onClick={handleSave} loading={saving} disabled={!dirty || invalid}>
              {saving ? t('common.saving') : t('common.saveChanges')}
            </Button>
          }
        />
        <CardBody className="space-y-4">
          <SegmentedControl<SendMode>
            label={t('sendPolicy.modeTitle')}
            className="flex w-full sm:w-auto"
            value={mode}
            onChange={(value) => {
              setSuccess('');
              setMode(value);
            }}
            options={[
              { value: 'all', label: t('sendPolicy.mode.all') },
              { value: 'none', label: t('sendPolicy.mode.none') },
              { value: 'selected', label: t('sendPolicy.mode.selected') },
            ]}
          />
          <p className="text-sm text-fg-muted">{t(`sendPolicy.modeHint.${mode}`)}</p>
          {mode === 'none' && <Alert tone="warning">{t('sendPolicy.noneWarning')}</Alert>}
        </CardBody>
      </Card>

      {mode === 'selected' && (
        <Card>
          <CardHeader
            title={t('sendPolicy.countriesTitle')}
            description={t(
              selected.length === 1
                ? 'sendPolicy.countriesCount.one'
                : 'sendPolicy.countriesCount.other',
              { count: selected.length },
            )}
            actions={
              selected.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                  {t('sendPolicy.clear')}
                </Button>
              )
            }
          />
          <CardBody className="space-y-4">
            {invalid ? (
              <Alert tone="warning">{t('sendPolicy.selectAtLeastOne')}</Alert>
            ) : (
              <ul className="flex flex-wrap gap-2" aria-label={t('sendPolicy.countriesTitle')}>
                {selectedOptions.map((c) => (
                  <li
                    key={c.code}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-muted py-1 pr-1 pl-3 text-sm text-fg"
                  >
                    <span aria-hidden="true">{c.flag}</span>
                    <span className="truncate">{c.name}</span>
                    <button
                      type="button"
                      onClick={() => toggle(c.code)}
                      className="rounded-full p-0.5 text-fg-subtle hover:bg-surface-hover hover:text-fg"
                      aria-label={t('sendPolicy.remove', { name: c.name })}
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('sendPolicy.searchPlaceholder')}
                aria-label={t('sendPolicy.searchPlaceholder')}
                className="pl-9"
              />
            </div>

            <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {visible.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-fg-muted">
                  {t('sendPolicy.noMatches')}
                </li>
              )}
              {visible.map((c) => {
                const checked = selected.includes(c.code);
                return (
                  <li key={c.code}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-hover',
                        checked && 'bg-primary-soft/50',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(c.code)}
                        className="h-4 w-4 shrink-0 accent-primary"
                      />
                      <span aria-hidden="true">{c.flag}</span>
                      <span className="min-w-0 flex-1 truncate text-fg">{c.name}</span>
                      <span className="shrink-0 text-xs text-fg-subtle tabular-nums">
                        {c.code} · +{c.callingCode}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-fg-subtle">{t('sendPolicy.sharedCodeNote')}</p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
