import {
  insertTextFor,
  setPrefixFor,
  type ATCommandInfo,
  type ATFormKind,
  type ATRisk,
} from '@/lib/at';
import { Alert, Badge, InfoIcon, type Tone } from '@/components/ui';

const RISK_BADGE: Record<ATRisk, { tone: Tone; label: string }> = {
  safe: { tone: 'success', label: 'Read only' },
  config: { tone: 'primary', label: 'Changes settings' },
  dangerous: { tone: 'danger', label: 'Dangerous' },
  unknown: { tone: 'warning', label: 'Unknown' },
};

export function RiskBadge({ risk }: { risk: ATRisk }) {
  const { tone, label } = RISK_BADGE[risk];
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}

interface ATCommandDocProps {
  info: ATCommandInfo;
  /** Risk of the command as currently typed, which depends on its form. */
  risk: ATRisk;
  kind?: ATFormKind;
  /** false when AT+CLAC worked and did not list this command. */
  supported?: boolean;
  /** Replaces the input with text. */
  onInsert: (text: string) => void;
  /** Sets one parameter of the set form, keeping the others. */
  onParam: (prefix: string, position: number, value: string) => void;
}

/** Reference card for one command, shown under the console input. */
export default function ATCommandDoc({
  info,
  risk,
  kind,
  supported,
  onInsert,
  onParam,
}: ATCommandDocProps) {
  const setForm = info.forms.find((f) => f.kind === 'set');
  const placeholders = setForm ? [...setForm.syntax.matchAll(/<([^>]+)>/g)].map((m) => m[1]) : [];
  // Warnings only matter for the forms that act, not for reads and tests.
  const showWarning = info.warning && (kind === undefined || kind === 'execute' || kind === 'set');

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface-muted p-4">
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-mono text-sm font-semibold text-fg">AT{info.name}</code>
        <span className="text-sm font-medium text-fg">{info.title}</span>
        <Badge>{info.category}</Badge>
        <RiskBadge risk={risk} />
        {supported === false && <Badge tone="warning">Not reported by this modem</Badge>}
      </div>

      <p className="text-sm text-fg-muted">{info.description}</p>

      {showWarning && (
        <Alert tone={info.risk === 'dangerous' ? 'danger' : 'info'}>{info.warning}</Alert>
      )}

      <section>
        <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-fg-subtle uppercase">
          Syntax
        </h4>
        <ul className="divide-y divide-border rounded-md border border-border bg-surface">
          {info.forms.map((form) => (
            <li key={form.syntax}>
              <button
                type="button"
                onClick={() => onInsert(insertTextFor(form.syntax))}
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-surface-hover sm:flex-row sm:items-baseline sm:gap-4"
                title="Insert into the command field"
              >
                <code className="font-mono text-xs break-all text-primary sm:w-64 sm:shrink-0">
                  {form.syntax}
                </code>
                <span className="text-xs text-fg-muted">{form.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {info.params && info.params.length > 0 && (
        <section>
          <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-fg-subtle uppercase">
            Parameters
          </h4>
          <dl className="space-y-2.5">
            {info.params.map((param) => {
              const position = placeholders.indexOf(param.name);
              const prefix = setForm ? setPrefixFor(setForm.syntax) : '';
              return (
                <div key={param.name}>
                  <dt className="text-xs">
                    <code className="font-mono font-semibold text-fg">&lt;{param.name}&gt;</code>{' '}
                    <span className="text-fg-muted">{param.description}</span>
                  </dt>
                  {param.values && (
                    <dd className="mt-1.5 flex flex-wrap gap-1.5">
                      {param.values.map((v) =>
                        position >= 0 ? (
                          <button
                            key={v.value}
                            type="button"
                            onClick={() => onParam(prefix, position, v.value)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-xs transition-colors hover:border-primary hover:bg-primary-soft/40"
                            title={`Use ${v.value}`}
                          >
                            <code className="font-mono font-semibold text-primary">{v.value}</code>
                            <span className="text-fg-muted">{v.description}</span>
                          </button>
                        ) : (
                          <span
                            key={v.value}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs"
                          >
                            <code className="font-mono font-semibold text-fg">{v.value}</code>
                            <span className="text-fg-muted">{v.description}</span>
                          </span>
                        ),
                      )}
                    </dd>
                  )}
                </div>
              );
            })}
          </dl>
        </section>
      )}

      <div className="flex flex-col gap-2 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
        {info.response && (
          <span className="min-w-0">
            <span className="text-fg-subtle">Response </span>
            <code className="font-mono break-all whitespace-pre-wrap text-fg">{info.response}</code>
          </span>
        )}
        {info.example && (
          <span>
            <span className="text-fg-subtle">Example </span>
            <button
              type="button"
              onClick={() => onInsert(info.example!)}
              className="font-mono text-primary hover:underline"
            >
              {info.example}
            </button>
          </span>
        )}
        {info.reference && <span className="text-fg-subtle sm:ml-auto">{info.reference}</span>}
      </div>
    </div>
  );
}

/** Shown when the typed command is not in the catalog. */
export function UnknownCommandDoc({ command, reported }: { command: string; reported: boolean }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-muted p-4">
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-mono text-sm font-semibold break-all text-fg">{command}</code>
        <RiskBadge risk="unknown" />
        {reported && <Badge tone="primary">Reported by this modem</Badge>}
      </div>
      <p className="flex gap-2 text-sm text-fg-muted">
        <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
        {reported
          ? 'This modem lists the command, but it is not documented here.'
          : 'This command is not in the reference, so its effect is unknown.'}{' '}
        You will be asked to confirm before it is sent.
      </p>
    </div>
  );
}
