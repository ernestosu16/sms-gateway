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
import {
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
  TerminalIcon,
  useConfirm,
} from '@/components/ui';

interface HistoryEntry {
  id: number;
  command: string;
  response: string;
  failed: boolean;
  timestamp: Date;
}

interface ConfirmationRequired {
  requires_confirmation: true;
  risk: 'dangerous' | 'unknown';
  warning?: string;
  title?: string;
}

/** Read-only commands worth a single click. */
const QUICK_COMMANDS = ['AT', 'ATI', 'AT+CSQ', 'AT+CREG?', 'AT+COPS?', 'AT+CPIN?', 'AT+CPMS?'];

const LISTBOX_ID = 'at-suggestions';

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Admin console for raw AT commands with autocomplete and inline reference. */
export default function ATConsole() {
  const [catalog, setCatalog] = useState<ATCatalog | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [command, setCommand] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  // Position while browsing sent commands with the arrow keys; -1 is the draft.
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<ComponentRef<'input'>>(null);
  const nextId = useRef(0);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    api
      .get<ATCatalog>('/modem/at/commands')
      .then((res) => setCatalog(res.data))
      .catch(() => setCatalogError(true));
  }, []);

  const allSuggestions = useMemo(() => (catalog ? buildSuggestions(catalog) : []), [catalog]);
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

  const sentCommands = useMemo(() => history.map((h) => h.command), [history]);

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

  const addHistory = (cmd: string, response: string, failed: boolean) => {
    setHistory((prev) => [
      { id: nextId.current++, command: cmd, response, failed, timestamp: new Date() },
      ...prev,
    ]);
  };

  const run = async (cmd: string, confirmed = false): Promise<void> => {
    setSending(true);
    setError('');
    try {
      const res = await api.post<{ response: string }>('/modem/at', {
        command: cmd,
        confirm: confirmed || undefined,
      });
      addHistory(cmd, res.data.response, false);
      setInput('');
    } catch (err) {
      const data = isAxiosError(err) ? err.response?.data : undefined;
      if (isAxiosError(err) && err.response?.status === 409 && data?.requires_confirmation) {
        setSending(false);
        const required = data as ConfirmationRequired;
        const ok = await confirm({
          title:
            required.risk === 'unknown'
              ? 'Send an unrecognised command?'
              : `Run ${required.title ?? cmd}?`,
          description: (
            <>
              <code className="font-mono text-xs break-all text-fg">{cmd}</code>
              <p className="mt-2">{required.warning}</p>
            </>
          ),
          confirmLabel: 'Send anyway',
          tone: required.risk === 'dangerous' ? 'danger' : 'warning',
        });
        if (ok) return run(cmd, true);
        focusInput();
        return;
      }
      const message =
        typeof data?.error === 'string'
          ? data.error
          : err instanceof Error
            ? err.message
            : 'Command failed.';
      setError(message);
      addHistory(cmd, message, true);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cmd = command.trim();
    if (!cmd || syntaxError) return;
    setOpen(false);
    run(cmd);
  };

  return (
    <Card>
      <CardHeader
        title="AT Command"
        description="Type a command or search by name, e.g. csq or signal."
        actions={
          history.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setHistory([])}>
              Clear history
            </Button>
          )
        }
      />
      <CardBody className="space-y-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="atCommand" className="sr-only">
              AT command
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
              className="block w-full min-w-0 rounded-lg border border-border-strong bg-field px-3 py-2 font-mono text-base text-fg shadow-sm transition-colors placeholder:text-fg-subtle focus:border-primary focus:ring-2 focus:ring-primary/25 focus:outline-none aria-invalid:border-danger sm:text-sm"
            />

            {listOpen && (
              <ul
                id={LISTBOX_ID}
                role="listbox"
                aria-label="Command suggestions"
                className="absolute inset-x-0 top-full z-10 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-xl"
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

            {/* While suggestions are showing, the text is a search, not a command yet. */}
            {syntaxError && !listOpen ? (
              <p className="mt-1.5 text-xs text-danger">{syntaxError}</p>
            ) : (
              <p className="mt-1.5 hidden text-xs text-fg-subtle sm:block">
                Tab completes · ↑↓ browse suggestions or history · Esc closes
              </p>
            )}
          </div>
          <Button
            type="submit"
            disabled={!command.trim() || !!syntaxError}
            loading={sending}
            icon={<TerminalIcon className="h-4 w-4" />}
          >
            {sending ? 'Sending...' : 'Send'}
          </Button>
        </form>

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

        {catalogError && (
          <Alert tone="warning">
            The command reference could not be loaded. Commands can still be sent.
          </Alert>
        )}

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

        {error && <Alert>{error}</Alert>}

        {history.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-fg">Command History</h3>
            {history.map((entry) => {
              const notes = decodeATResponse(entry.response);
              return (
                <div key={entry.id} className="overflow-hidden rounded-lg border border-border">
                  <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-muted px-3 py-2">
                    <button
                      type="button"
                      onClick={() => {
                        setInput(entry.command);
                        focusInput();
                      }}
                      className="truncate font-mono text-sm font-semibold text-primary hover:underline"
                      title="Edit and send again"
                    >
                      {entry.command}
                    </button>
                    <span className="shrink-0 text-xs text-fg-subtle">
                      {formatTime(entry.timestamp)}
                    </span>
                  </div>
                  <pre
                    className={cn(
                      'overflow-x-auto bg-code p-3 font-mono text-xs break-words whitespace-pre-wrap',
                      entry.failed ? 'text-danger' : 'text-code-fg',
                    )}
                  >
                    {entry.response.trim() || '(empty response)'}
                  </pre>
                  {notes.length > 0 && (
                    <ul className="space-y-0.5 border-t border-border bg-surface px-3 py-2 text-xs text-fg-muted">
                      {notes.map((note, i) => (
                        <li key={i}>→ {note}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
      {dialog}
    </Card>
  );
}
