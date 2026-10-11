import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { isAxiosError } from 'axios';
import api from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatTimeWithSeconds } from '@/lib/format';
import { apiErrorMessage } from '@/lib/apiError';
import { useI18n } from '@/lib/i18n';
import {
  atText,
  buildSuggestions,
  decodeATResponse,
  matchSuggestions,
  parseAT,
  riskOf,
  validateAT,
  withParam,
  type ATCatalog,
  type Suggestion,
} from '@/lib/at';
import ATCommandDoc, { RiskBadge, UnknownCommandDoc } from '@/components/at/ATCommandDoc';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  RefreshIcon,
  Spinner,
  TerminalIcon,
  useConfirm,
} from '@/components/ui';

type EntryStatus = 'pending' | 'ok' | 'error' | 'cancelled';

interface ConsoleEntry {
  id: number;
  command: string;
  status: EntryStatus;
  response: string;
  /** ISO timestamp, so entries survive a round trip through localStorage. */
  time: string;
}

interface ConfirmationRequired {
  requires_confirmation: true;
  risk: 'dangerous' | 'unknown';
  /** Catalog name of the command, absent when the catalog does not know it. */
  name?: string;
}

/** Read-only commands worth a single click. */
const QUICK_COMMANDS = ['AT', 'ATI', 'AT+CSQ', 'AT+CREG?', 'AT+COPS?', 'AT+CPIN?', 'AT+CPMS?'];

const LISTBOX_ID = 'at-suggestions';
const STORAGE_KEY = 'sms-gateway.at-console';
const MAX_ENTRIES = 200;

/** Modem replies use CRLF and pad with blank lines; a console shows the content. */
function cleanResponse(response: string): string {
  return response.replace(/\r/g, '').replace(/^\n+|\n+$/g, '');
}

// The log is a per-browser convenience: storage can be unavailable (private
// windows, blocked site data), and the console must work the same without it.
function loadEntries(): ConsoleEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ConsoleEntry[]) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: ConsoleEntry[]) {
  try {
    // A pending command has no outcome yet; after a reload it never will.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries.filter((e) => e.status !== 'pending')),
    );
  } catch {
    // Not persisting the log is acceptable.
  }
}

/** Admin console for raw AT commands with autocomplete and inline reference. */
export default function ATConsole() {
  const [catalog, setCatalog] = useState<ATCatalog | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [command, setCommand] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [sending, setSending] = useState(false);
  const [entries, setEntries] = useState<ConsoleEntry[]>(loadEntries);
  // Position while browsing sent commands with the arrow keys; -1 is the draft.
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<ComponentRef<'input'>>(null);
  const logRef = useRef<ComponentRef<'div'>>(null);
  const nextId = useRef(entries.reduce((max, e) => Math.max(max, e.id + 1), 0));
  const { confirm, dialog } = useConfirm();
  const { t, language } = useI18n();

  useEffect(() => {
    api
      .get<ATCatalog>('/modem/at/commands')
      .then((res) => setCatalog(res.data))
      .catch(() => setCatalogError(true));
  }, []);

  useEffect(() => {
    saveEntries(entries);
    // Like a terminal, keep the newest output in view.
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [entries]);

  // Rebuilt per language: entries the catalog lacks carry a translated description.
  const allSuggestions = useMemo(
    () => (catalog ? buildSuggestions(catalog) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog, language],
  );
  const suggestions = useMemo(
    () => matchSuggestions(allSuggestions, command),
    [allSuggestions, command],
  );
  const supported = useMemo(
    () => (catalog?.supported ? new Set(catalog.supported) : null),
    [catalog],
  );
  const byName = useMemo(
    () => new Map((catalog?.commands ?? []).map((c) => [c.name, c])),
    [catalog],
  );

  const listOpen = open && suggestions.length > 0;
  const syntaxError = validateAT(command.trim());
  const parsed = parseAT(command);
  const typedInfo = parsed ? byName.get(parsed.name) : undefined;

  // The reference follows the highlighted suggestion while browsing the list,
  // and the typed command otherwise.
  const highlighted = listOpen && active >= 0 ? suggestions[active] : undefined;
  const docInfo = highlighted ? highlighted.info : typedInfo;
  const docKind = highlighted
    ? highlighted.info?.forms.find((f) => f.syntax === highlighted.syntax)?.kind
    : parsed?.kind;
  const docRisk = highlighted ? riskOf(highlighted.info, docKind) : riskOf(typedInfo, parsed?.kind);

  const focusInput = () => inputRef.current?.focus();

  const setInput = (text: string) => {
    setCommand(text);
    setHistoryIndex(-1);
    setActive(-1);
  };

  const accept = (s: Suggestion) => {
    setInput(s.insert);
    setOpen(false);
    focusInput();
  };

  // Newest first, without repeating the same command back to back.
  const sentCommands = useMemo(
    () =>
      entries
        .map((e) => e.command)
        .reverse()
        .filter((c, i, all) => i === 0 || c !== all[i - 1]),
    [entries],
  );

  const handleKeyDown = (e: KeyboardEvent<ComponentRef<'input'>>) => {
    if (listOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if ((e.key === 'Enter' && active >= 0) || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        const choice = suggestions[Math.max(active, 0)];
        if (choice) accept(choice);
        return;
      }
      return;
    }

    // With the list closed the arrows walk through previously sent commands.
    if (e.key === 'ArrowUp' && sentCommands.length > 0) {
      e.preventDefault();
      const next = Math.min(historyIndex + 1, sentCommands.length - 1);
      setHistoryIndex(next);
      setCommand(sentCommands[next] ?? '');
    } else if (e.key === 'ArrowDown' && historyIndex >= 0) {
      e.preventDefault();
      const next = historyIndex - 1;
      setHistoryIndex(next);
      setCommand(next >= 0 ? (sentCommands[next] ?? '') : '');
    }
  };

  const updateEntry = (id: number, patch: Partial<ConsoleEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  /**
   * Echoes the command into the log straight away, then fills in the reply.
   * A command the server wants confirmed stays pending while the dialog is
   * open and ends up either answered or marked as cancelled.
   */
  const run = async (cmd: string) => {
    const id = nextId.current++;
    setEntries((prev) =>
      [
        ...prev,
        {
          id,
          command: cmd,
          status: 'pending' as const,
          response: '',
          time: new Date().toISOString(),
        },
      ].slice(-MAX_ENTRIES),
    );
    setInput('');
    setOpen(false);
    setSending(true);

    const send = async (confirmed: boolean): Promise<void> => {
      try {
        const res = await api.post<{ response: string }>('/modem/at', {
          command: cmd,
          confirm: confirmed || undefined,
        });
        updateEntry(id, { status: 'ok', response: res.data.response });
      } catch (err) {
        const data = isAxiosError(err) ? err.response?.data : undefined;
        if (isAxiosError(err) && err.response?.status === 409 && data?.requires_confirmation) {
          const required = data as ConfirmationRequired;
          const text = required.name !== undefined ? atText(required.name) : undefined;
          const warning =
            required.risk === 'dangerous'
              ? text?.warning
              : text
                ? t('at.unrecognised')
                : t('at.unknownCommand');
          const ok = await confirm({
            title:
              required.risk === 'unknown'
                ? t('at.unknownTitle')
                : t('at.runTitle', { command: text?.title || cmd }),
            description: (
              <>
                <code className="font-mono text-xs break-all text-fg">{cmd}</code>
                {warning && <p className="mt-2">{warning}</p>}
              </>
            ),
            confirmLabel: t('at.sendAnyway'),
            tone: required.risk === 'dangerous' ? 'danger' : 'warning',
          });
          if (!ok) {
            updateEntry(id, { status: 'cancelled' });
            return;
          }
          return send(true);
        }
        // A modem failure has no code; its text is the modem's own reply.
        const message = apiErrorMessage(
          err,
          typeof data?.error === 'string' ? data.error : t('at.commandFailed'),
        );
        updateEntry(id, { status: 'error', response: message });
      }
    };

    try {
      await send(false);
    } finally {
      setSending(false);
      focusInput();
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cmd = command.trim();
    if (!cmd || syntaxError || sending) return;
    run(cmd);
  };

  return (
    <Card>
      <CardHeader
        title={t('at.title')}
        description={t('at.description')}
        actions={
          entries.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setEntries([])} disabled={sending}>
              {t('at.clear')}
            </Button>
          )
        }
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_COMMANDS.map((cmd) => (
            <button
              key={cmd}
              type="button"
              disabled={sending}
              onClick={() => run(cmd)}
              className="rounded-md border border-border bg-surface-muted px-2 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-primary hover:text-fg disabled:opacity-50"
            >
              {cmd}
            </button>
          ))}
        </div>

        {/* Terminal: the log scrolls above, the prompt stays at the bottom. */}
        <div className="rounded-lg border border-border bg-code font-mono text-xs text-code-fg shadow-inner sm:text-[13px]">
          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-label={t('at.output')}
            className="h-72 space-y-3 overflow-y-auto p-3 sm:h-96 sm:p-4"
          >
            {entries.length === 0 ? (
              <p className="text-slate-500">{t('at.emptyLog')}</p>
            ) : (
              entries.map((entry) => (
                <ConsoleLine key={entry.id} entry={entry} onRetry={run} retryDisabled={sending} />
              ))
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="relative flex items-center gap-2 border-t border-white/10 px-3 py-2 sm:px-4"
          >
            <span aria-hidden="true" className="font-semibold text-emerald-400">
              ›
            </span>
            <label htmlFor="atCommand" className="sr-only">
              {t('at.command')}
            </label>
            <input
              ref={inputRef}
              id="atCommand"
              type="text"
              role="combobox"
              aria-expanded={listOpen}
              aria-controls={LISTBOX_ID}
              aria-autocomplete="list"
              aria-activedescendant={listOpen && active >= 0 ? `at-option-${active}` : undefined}
              aria-invalid={syntaxError && !listOpen ? true : undefined}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              value={command}
              onChange={(e) => {
                setInput(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={handleKeyDown}
              placeholder="AT+CSQ"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-base text-slate-100 placeholder:text-slate-600 focus:outline-none sm:text-[13px]"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!command.trim() || !!syntaxError || sending}
              loading={sending}
              icon={<TerminalIcon className="h-4 w-4" />}
            >
              <span className="hidden sm:inline">
                {sending ? t('common.sending') : t('at.send')}
              </span>
            </Button>

            {/* The prompt sits at the bottom, so suggestions open upwards. */}
            {listOpen && (
              <ul
                id={LISTBOX_ID}
                role="listbox"
                aria-label={t('at.suggestions')}
                className="absolute inset-x-0 bottom-full z-10 mb-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-surface py-1 font-sans shadow-xl"
              >
                {suggestions.map((s, i) => {
                  const kind = s.info?.forms.find((f) => f.syntax === s.syntax)?.kind;
                  const notReported = s.info && supported !== null && !supported.has(s.info.name);
                  return (
                    <li
                      key={s.key}
                      id={`at-option-${i}`}
                      role="option"
                      aria-selected={i === active}
                      // mousedown keeps focus in the input, so blur does not
                      // close the list before the click lands.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        accept(s);
                      }}
                      onMouseEnter={() => setActive(i)}
                      className={cn(
                        'flex cursor-pointer items-start justify-between gap-3 px-3 py-2',
                        i === active && 'bg-surface-hover',
                        notReported && 'opacity-60',
                      )}
                    >
                      <span className="min-w-0">
                        <code className="block font-mono text-sm break-all text-fg">
                          {s.syntax}
                        </code>
                        <span className="block truncate text-xs text-fg-muted">
                          {s.description}
                        </span>
                      </span>
                      <span className="hidden shrink-0 pt-0.5 sm:block">
                        <RiskBadge risk={riskOf(s.info, kind)} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </form>
        </div>

        {/* While suggestions are showing, the text is a search, not a command yet. */}
        {syntaxError && !listOpen ? (
          <p className="-mt-2 text-xs text-danger">{syntaxError}</p>
        ) : (
          <p className="-mt-2 hidden text-xs text-fg-subtle sm:block">{t('at.keys')}</p>
        )}

        {catalogError && <Alert tone="warning">{t('at.catalogFailed')}</Alert>}

        {docInfo ? (
          <ATCommandDoc
            info={docInfo}
            risk={docRisk}
            kind={docKind}
            supported={supported ? supported.has(docInfo.name) : undefined}
            onInsert={(text) => {
              setInput(text);
              focusInput();
            }}
            onParam={(prefix, position, value) => {
              setInput(withParam(command, prefix, position, value));
              focusInput();
            }}
          />
        ) : (
          catalog &&
          command.trim() &&
          !syntaxError &&
          !highlighted && (
            <UnknownCommandDoc
              command={command.trim().toUpperCase()}
              reported={!!parsed && !!supported?.has(parsed.name)}
            />
          )
        )}
      </CardBody>
      {dialog}
    </Card>
  );
}

/** One command and its outcome, rendered like a terminal transcript. */
function ConsoleLine({
  entry,
  onRetry,
  retryDisabled,
}: {
  entry: ConsoleEntry;
  onRetry: (command: string) => void;
  retryDisabled: boolean;
}) {
  const { t } = useI18n();
  const response = cleanResponse(entry.response);
  const notes =
    entry.status === 'ok' || entry.status === 'error' ? decodeATResponse(entry.response) : [];

  return (
    <div className="group">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="font-semibold text-emerald-400">
          ›
        </span>
        <span className="min-w-0 flex-1 font-semibold break-all text-slate-100">
          {entry.command}
        </span>
        <button
          type="button"
          onClick={() => onRetry(entry.command)}
          disabled={retryDisabled}
          className="shrink-0 rounded p-1 text-slate-500 transition hover:bg-white/10 hover:text-slate-200 disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          aria-label={t('at.runAgainLabel', { command: entry.command })}
          title={t('at.runAgain')}
        >
          <RefreshIcon className="h-3.5 w-3.5" />
        </button>
        <time dateTime={entry.time} className="shrink-0 text-[11px] text-slate-500">
          {formatTimeWithSeconds(entry.time)}
        </time>
      </div>

      <div className="mt-1 pl-4">
        {entry.status === 'pending' && (
          <p className="flex items-center gap-2 text-slate-400">
            <Spinner className="h-3 w-3" /> {t('at.waiting')}
          </p>
        )}
        {entry.status === 'cancelled' && <p className="text-amber-300">{t('at.cancelled')}</p>}
        {(entry.status === 'ok' || entry.status === 'error') && (
          <pre
            className={cn(
              'font-mono break-words whitespace-pre-wrap',
              entry.status === 'error' ? 'text-red-400' : 'text-slate-300',
            )}
          >
            {response || t('at.emptyResponse')}
          </pre>
        )}
        {notes.map((note, i) => (
          <p key={i} className="text-sky-300">
            # {note}
          </p>
        ))}
      </div>
    </div>
  );
}
