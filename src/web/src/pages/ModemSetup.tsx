import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import en, { type MessageKey } from '@/locales/en';
import { ModemHealthCards, useModemHealth } from '@/components/ModemHealth';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckIcon,
  EmptyState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  PlusIcon,
  RefreshIcon,
  SlidersIcon,
  Spinner,
  Textarea,
  XIcon,
  useConfirm,
} from '@/components/ui';

interface ProfileCommand {
  command: string;
  expect?: string;
}

interface ProfileStep {
  title: string;
  commands: ProfileCommand[];
}

interface ModemProfile {
  id: string;
  name: string;
  description: string;
  notes: string;
  steps: ProfileStep[];
}

type StepStatus = 'pending' | 'running' | 'ok' | 'failed';

/** What went wrong in the failed step. */
interface RunFailure {
  step: number;
  command: string;
  /** Pattern the reply did not match; absent when the command itself failed. */
  expect?: string;
  /** The modem's reply, or the error message when the command failed. */
  output: string;
}

interface RunState {
  steps: StepStatus[];
  failure: RunFailure | null;
  done: boolean;
}

/** Separates a command from its expected-response pattern in the editor. */
const EXPECT_SEPARATOR = '=>';

/** Prefix of the translation keys the seeded profiles store in place of text. */
const SEED_KEY_PREFIX = 'modemSetup.seed.';

function isSeedKey(text: string): text is MessageKey {
  return text.startsWith(SEED_KEY_PREFIX) && text in en;
}

/**
 * Returns a translator for profile text: seeded profiles store translation
 * keys so they follow the viewer's language, while text an admin typed is
 * shown as typed.
 */
function useProfileText() {
  const { t } = useI18n();
  return useCallback((text: string) => (isSeedKey(text) ? t(text) : text), [t]);
}

/** Prefers the server's validation message over a generic fallback. */
function errorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

/**
 * Checks a response against a profile expectation. The server compiles the
 * same pattern case-insensitively when the profile is saved.
 */
function matchesExpect(expect: string, response: string): boolean {
  try {
    return new RegExp(expect, 'i').test(response);
  } catch {
    return false;
  }
}

export default function ModemSetup() {
  const { user } = useAuth();
  const { t } = useI18n();

  // Checked before mounting the manager so non-admins never hit the admin-only API.
  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('nav.modemSetup')} />
        <Alert>{t('common.adminOnly')}</Alert>
      </div>
    );
  }

  return <ModemSetupManager />;
}

function ModemSetupManager() {
  const { t } = useI18n();
  const pt = useProfileText();
  const { confirm, dialog } = useConfirm();
  const health = useModemHealth();

  const [profiles, setProfiles] = useState<ModemProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // null shows the selected profile; 'new' or a profile opens the editor.
  const [editing, setEditing] = useState<ModemProfile | 'new' | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [run, setRun] = useState<RunState | null>(null);
  const running = run !== null && !run.done;

  const load = useCallback(
    async (select?: string) => {
      try {
        const res = await api.get<ModemProfile[]>('/modem/profiles');
        setProfiles(res.data);
        setSelectedId((current) => {
          const wanted = select ?? current;
          return res.data.some((p) => p.id === wanted) ? wanted : (res.data[0]?.id ?? null);
        });
      } catch (err) {
        setError(errorMessage(err, t('modemSetup.loadFailed')));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    load();
  }, [load]);

  const selected = profiles.find((p) => p.id === selectedId) ?? null;

  const select = (id: string) => {
    if (running) return;
    setSelectedId(id);
    setEditing(null);
    setRun(null);
    setError('');
    setSuccess('');
  };

  const setStep = (index: number, status: StepStatus, failure: RunFailure | null = null) =>
    setRun(
      (prev) =>
        prev && {
          ...prev,
          steps: prev.steps.map((s, i) => (i === index ? status : s)),
          failure: failure ?? prev.failure,
        },
    );

  /**
   * Asks once, then sends every command in order through the AT endpoint and
   * ticks each step off. A command error or a reply that does not match its
   * expectation fails the step and stops the run.
   */
  const runProfile = async (profile: ModemProfile) => {
    const ok = await confirm({
      title: t('modemSetup.runConfirmTitle', { name: profile.name }),
      description: t('modemSetup.runConfirmBody'),
      confirmLabel: t('modemSetup.run'),
      tone: 'warning',
    });
    if (!ok) return;

    setError('');
    setSuccess('');
    setRun({ steps: profile.steps.map(() => 'pending'), failure: null, done: false });

    try {
      for (const [s, step] of profile.steps.entries()) {
        setStep(s, 'running');
        let failure: RunFailure | null = null;
        for (const { command, expect } of step.commands) {
          try {
            // Already confirmed above, so risky commands need no second prompt.
            const res = await api.post<{ response: string }>('/modem/at', {
              command,
              confirm: true,
            });
            if (expect && !matchesExpect(expect, res.data.response)) {
              failure = { step: s, command, expect, output: res.data.response.trim() };
            }
          } catch (err) {
            failure = {
              step: s,
              command,
              output: errorMessage(err, t('modemSetup.commandFailed')),
            };
          }
          if (failure) break;
        }
        if (failure) {
          setStep(s, 'failed', failure);
          return;
        }
        setStep(s, 'ok');
      }
    } finally {
      setRun((prev) => prev && { ...prev, done: true });
      // Show whether the modem is still up and registered after the setup.
      health.refresh();
    }
  };

  const handleDelete = async (profile: ModemProfile) => {
    const ok = await confirm({
      title: t('modemSetup.deleteTitle', { name: profile.name }),
      description: t('modemSetup.deleteBody'),
      confirmLabel: t('common.delete'),
    });
    if (!ok) return;
    setError('');
    setSuccess('');
    try {
      await api.delete(`/modem/profiles/${profile.id}`);
      setEditing(null);
      setRun(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, t('modemSetup.deleteFailed')));
    }
  };

  const handleSaved = async (profile: ModemProfile, created: boolean) => {
    setEditing(null);
    setRun(null);
    setSuccess(
      t(created ? 'modemSetup.createdOk' : 'modemSetup.updatedOk', { name: profile.name }),
    );
    await load(profile.id);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.modemSetup')}
        description={t('modemSetup.description')}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={health.refresh}
              loading={health.refreshing}
              disabled={running}
              icon={<RefreshIcon className="h-4 w-4" />}
            >
              {health.refreshing ? t('modem.refreshing') : t('modem.refresh')}
            </Button>
            <Button
              icon={<PlusIcon className="h-4 w-4" />}
              disabled={running}
              onClick={() => {
                setEditing('new');
                setError('');
                setSuccess('');
              }}
            >
              {t('modemSetup.new')}
            </Button>
          </>
        }
      />

      <ModemHealthCards health={health} />

      {error && <Alert>{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      {loading ? (
        <Card>
          <LoadingState label={t('modemSetup.loading')} />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <Card className="self-start">
            <CardHeader title={t('modemSetup.profiles')} />
            {profiles.length === 0 ? (
              <EmptyState
                icon={<SlidersIcon className="h-6 w-6" />}
                title={t('modemSetup.empty')}
              />
            ) : (
              <ul className="divide-y divide-border">
                {profiles.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => select(p.id)}
                      disabled={running}
                      aria-current={p.id === selectedId ? 'true' : undefined}
                      className={cn(
                        'block w-full px-4 py-3 text-left transition-colors hover:bg-surface-hover disabled:cursor-not-allowed sm:px-6 lg:px-4',
                        p.id === selectedId && 'bg-primary-soft/40',
                      )}
                    >
                      <span className="block text-sm font-medium text-fg">{p.name}</span>
                      {p.description && (
                        <span className="mt-0.5 block text-xs text-fg-muted">
                          {pt(p.description)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="min-w-0">
            {editing ? (
              <ProfileEditor
                key={editing === 'new' ? 'new' : editing.id}
                profile={editing === 'new' ? null : editing}
                onCancel={() => setEditing(null)}
                onSaved={handleSaved}
              />
            ) : selected ? (
              <ProfileView
                profile={selected}
                run={run}
                onRun={() => runProfile(selected)}
                onEdit={() => {
                  setEditing(selected);
                  setError('');
                  setSuccess('');
                }}
                onDelete={() => handleDelete(selected)}
              />
            ) : null}
          </div>
        </div>
      )}

      {dialog}
    </div>
  );
}

interface ProfileViewProps {
  profile: ModemProfile;
  run: RunState | null;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ProfileView({ profile, run, onRun, onEdit, onDelete }: ProfileViewProps) {
  const { t } = useI18n();
  const pt = useProfileText();
  const running = run !== null && !run.done;
  const succeeded = run?.done && run.steps.every((s) => s === 'ok');

  return (
    <Card>
      <CardHeader
        title={profile.name}
        description={pt(profile.description) || undefined}
        actions={
          <>
            <Button size="sm" loading={running} onClick={onRun}>
              {running ? t('modemSetup.running') : t('modemSetup.run')}
            </Button>
            <Button variant="secondary" size="sm" disabled={running} onClick={onEdit}>
              {t('common.edit')}
            </Button>
            <Button variant="danger-soft" size="sm" disabled={running} onClick={onDelete}>
              {t('common.delete')}
            </Button>
          </>
        }
      />
      <CardBody className="space-y-4">
        <ol className="space-y-3">
          {profile.steps.map((step, s) => {
            const status = run?.steps[s] ?? 'pending';
            return (
              <li key={s} className="flex items-start gap-3">
                <StepCheck status={status} />
                <div className="min-w-0 flex-1 pt-0.5">
                  <p
                    className={cn(
                      'text-sm',
                      status === 'pending' ? 'text-fg-muted' : 'font-medium text-fg',
                    )}
                  >
                    {pt(step.title)}
                  </p>
                  {status === 'failed' && run?.failure?.step === s && (
                    <FailureDetail failure={run.failure} />
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {succeeded && <Alert tone="success">{t('modemSetup.done')}</Alert>}
        {run?.done && run.failure && (
          <Alert>
            {t('modemSetup.failed', {
              step: pt(profile.steps[run.failure.step]?.title ?? ''),
            })}
          </Alert>
        )}

        {profile.notes && (
          <details className="text-sm text-fg-muted">
            <summary className="cursor-pointer font-medium text-fg">
              {t('modemSetup.notes')}
            </summary>
            <p className="mt-2 whitespace-pre-line">{pt(profile.notes)}</p>
          </details>
        )}
      </CardBody>
    </Card>
  );
}

/** The failing command, what was expected and what the modem answered. */
function FailureDetail({ failure }: { failure: RunFailure }) {
  const { t } = useI18n();
  return (
    <dl className="mt-2 space-y-1.5 rounded-lg border border-danger/30 bg-danger-soft p-3 text-xs text-danger-soft-fg">
      <div className="flex flex-wrap gap-x-2">
        <dt className="font-medium">{t('modemSetup.failure.command')}</dt>
        <dd className="font-mono break-all">{failure.command}</dd>
      </div>
      {failure.expect && (
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-medium">{t('modemSetup.failure.expected')}</dt>
          <dd className="font-mono break-all">{failure.expect}</dd>
        </div>
      )}
      <div>
        <dt className="font-medium">
          {failure.expect ? t('modemSetup.failure.reply') : t('modemSetup.failure.error')}
        </dt>
        <dd>
          <pre className="mt-1 max-h-40 overflow-auto font-mono whitespace-pre-wrap break-all">
            {failure.output || '—'}
          </pre>
        </dd>
      </div>
    </dl>
  );
}

/** Checkbox-style marker for a step: empty, spinning, ticked or crossed. */
function StepCheck({ status }: { status: StepStatus }) {
  const { t } = useI18n();
  const label = t(`modemSetup.status.${status}`);
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
        status === 'pending' && 'border-border-strong',
        status === 'running' && 'border-primary text-primary',
        status === 'ok' && 'border-success bg-success text-white',
        status === 'failed' && 'border-danger bg-danger text-white',
      )}
    >
      {status === 'running' && <Spinner className="h-3.5 w-3.5" />}
      {status === 'ok' && <CheckIcon className="h-4 w-4" />}
      {status === 'failed' && <XIcon className="h-4 w-4" />}
    </span>
  );
}

interface StepDraft {
  title: string;
  commands: string;
  /** Seed translation key the title came from, kept while the text is unchanged. */
  titleKey?: MessageKey;
}

function toDraft(step: ProfileStep, pt: (text: string) => string): StepDraft {
  return {
    title: pt(step.title),
    ...(isSeedKey(step.title) && { titleKey: step.title }),
    commands: step.commands
      .map((c) => (c.expect ? `${c.command} ${EXPECT_SEPARATOR} ${c.expect}` : c.command))
      .join('\n'),
  };
}

function fromDraft(draft: StepDraft, pt: (text: string) => string): ProfileStep {
  const commands = draft.commands
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf(EXPECT_SEPARATOR);
      if (at === -1) return { command: line };
      const expect = line.slice(at + EXPECT_SEPARATOR.length).trim();
      return { command: line.slice(0, at).trim(), ...(expect && { expect }) };
    });
  const title = draft.title.trim();
  return {
    title: draft.titleKey && title === pt(draft.titleKey) ? draft.titleKey : title,
    commands,
  };
}

/** Keeps a seed translation key while its translated text is left unchanged. */
function keepSeedKey(
  original: string | undefined,
  text: string,
  pt: (text: string) => string,
): string {
  return original && isSeedKey(original) && text === pt(original) ? original : text;
}

interface ProfileEditorProps {
  profile: ModemProfile | null;
  onCancel: () => void;
  onSaved: (profile: ModemProfile, created: boolean) => void;
}

function ProfileEditor({ profile, onCancel, onSaved }: ProfileEditorProps) {
  const { t } = useI18n();
  const pt = useProfileText();
  const [name, setName] = useState(profile?.name ?? '');
  const [description, setDescription] = useState(pt(profile?.description ?? ''));
  const [notes, setNotes] = useState(pt(profile?.notes ?? ''));
  const [steps, setSteps] = useState<StepDraft[]>(
    profile ? profile.steps.map((step) => toDraft(step, pt)) : [{ title: '', commands: '' }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateStep = (index: number, patch: Partial<StepDraft>) =>
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const moveStep = (index: number, by: -1 | 1) =>
    setSteps((prev) => {
      const a = prev[index];
      const b = prev[index + by];
      if (!a || !b) return prev;
      const next = [...prev];
      next[index] = b;
      next[index + by] = a;
      return next;
    });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      name: name.trim(),
      // Unchanged seeded text keeps its translation key, so it still follows
      // the viewer's language after saving.
      description: keepSeedKey(profile?.description, description.trim(), pt),
      notes: keepSeedKey(profile?.notes, notes.trim(), pt),
      steps: steps.map((step) => fromDraft(step, pt)),
    };
    try {
      const res = profile
        ? await api.put<ModemProfile>(`/modem/profiles/${profile.id}`, payload)
        : await api.post<ModemProfile>('/modem/profiles', payload);
      onSaved(res.data, !profile);
    } catch (err) {
      setError(errorMessage(err, t('modemSetup.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={
          profile ? t('modemSetup.editTitle', { name: profile.name }) : t('modemSetup.createTitle')
        }
      />
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <Alert>{error}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('common.name')} htmlFor="profileName">
              <Input
                id="profileName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                placeholder="Tello USA"
              />
            </Field>
            <Field label={t('modemSetup.descriptionField')} htmlFor="profileDescription">
              <Input
                id="profileDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={4000}
              />
            </Field>
          </div>

          <Field
            label={t('modemSetup.notes')}
            htmlFor="profileNotes"
            hint={t('modemSetup.notesHint')}
          >
            <Textarea
              id="profileNotes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={4000}
            />
          </Field>

          <fieldset className="space-y-4">
            <legend className="mb-1.5 block text-sm font-medium text-fg">
              {t('modemSetup.steps')}
            </legend>
            {steps.map((step, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-border p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-fg-muted">
                    {t('modemSetup.step', { n: i + 1 })}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={i === 0}
                      onClick={() => moveStep(i, -1)}
                    >
                      {t('modemSetup.moveUp')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={i === steps.length - 1}
                      onClick={() => moveStep(i, 1)}
                    >
                      {t('modemSetup.moveDown')}
                    </Button>
                    <Button
                      variant="danger-soft"
                      size="sm"
                      disabled={steps.length === 1}
                      onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                    >
                      {t('modemSetup.removeStep')}
                    </Button>
                  </div>
                </div>
                <Field label={t('modemSetup.stepTitle')} htmlFor={`stepTitle${i}`}>
                  <Input
                    id={`stepTitle${i}`}
                    value={step.title}
                    onChange={(e) => updateStep(i, { title: e.target.value })}
                    required
                    maxLength={100}
                  />
                </Field>
                <Field
                  label={t('modemSetup.commands')}
                  htmlFor={`stepCommands${i}`}
                  hint={t('modemSetup.commandsHint')}
                >
                  <Textarea
                    id={`stepCommands${i}`}
                    rows={Math.max(3, step.commands.split('\n').length)}
                    value={step.commands}
                    onChange={(e) => updateStep(i, { commands: e.target.value })}
                    required
                    spellCheck={false}
                    autoCapitalize="off"
                    className="font-mono text-xs"
                    placeholder={'AT\nAT+CPIN? => READY'}
                  />
                </Field>
              </div>
            ))}
            <Button
              variant="secondary"
              size="sm"
              icon={<PlusIcon className="h-4 w-4" />}
              onClick={() => setSteps((prev) => [...prev, { title: '', commands: '' }])}
            >
              {t('modemSetup.addStep')}
            </Button>
          </fieldset>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={saving}>
              {saving
                ? t('common.saving')
                : profile
                  ? t('common.saveChanges')
                  : t('modemSetup.create')}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
