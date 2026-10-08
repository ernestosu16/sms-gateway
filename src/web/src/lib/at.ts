/*
 * AT command helpers for the modem console. The catalog itself comes from
 * GET /modem/at/commands (internal/modem/atcatalog.go); this file only reads
 * it. parseAT mirrors parseATCommand in internal/modem/atcommand.go so the
 * console can preview a command's risk, but the server re-checks every
 * command and has the final say.
 */

export type ATRisk = 'safe' | 'config' | 'dangerous' | 'unknown';
export type ATFormKind = 'execute' | 'read' | 'test' | 'set';

export interface ATForm {
  kind: ATFormKind;
  syntax: string;
  description: string;
}

export interface ATParam {
  name: string;
  description: string;
  values?: { value: string; description: string }[];
}

export interface ATCommandInfo {
  name: string;
  title: string;
  category: string;
  description: string;
  forms: ATForm[];
  params?: ATParam[];
  response?: string;
  example?: string;
  risk: Exclude<ATRisk, 'unknown'>;
  warning?: string;
  reference?: string;
}

export interface ATCatalog {
  commands: ATCommandInfo[];
  /** Names the modem reported through AT+CLAC, or null if it cannot say. */
  supported: string[] | null;
}

/** Same rules as ValidateATCommand on the server. */
export function validateAT(cmd: string): string | null {
  if (cmd === '') return null;
  if (cmd.length > 256) return 'Commands are limited to 256 characters.';
  if (!/^[\x20-\x7e]*$/.test(cmd)) return 'Only printable ASCII characters are allowed.';
  if (!/^at/i.test(cmd)) return 'Commands must start with AT.';
  return null;
}

/** Splits a command into its name ("+CSQ", "&F", "I", "") and form. */
export function parseAT(input: string): { name: string; kind: ATFormKind } | null {
  const cmd = input.trim().toUpperCase();
  if (!cmd.startsWith('AT')) return null;
  const rest = cmd.slice(2);
  if (rest === '') return { name: '', kind: 'execute' };

  const extended = /^([+^$%#*][A-Z0-9_]+)(.*)$/.exec(rest);
  if (extended) {
    const [, name = '', tail = ''] = extended;
    if (tail === '') return { name, kind: 'execute' };
    if (tail === '?') return { name, kind: 'read' };
    if (tail === '=?') return { name, kind: 'test' };
    if (tail.startsWith('=') && !hasUnquotedSemicolon(tail.slice(1))) return { name, kind: 'set' };
    return null;
  }

  const basic = /^(&?[A-Z])(.*)$/.exec(rest);
  if (!basic) return null;
  const [, name = '', tail = ''] = basic;
  if (name === 'D') return tail ? { name, kind: 'set' } : null;
  if (tail === '') return { name, kind: 'execute' };
  if (tail === '?') return { name, kind: 'read' };
  if (/^\d+$/.test(tail)) return { name, kind: 'set' };
  return null;
}

function hasUnquotedSemicolon(s: string): boolean {
  let quoted = false;
  for (const c of s) {
    if (c === '"') quoted = !quoted;
    else if (c === ';' && !quoted) return true;
  }
  return false;
}

/** Risk of running the command as typed: read and test forms never change anything. */
export function riskOf(info: ATCommandInfo | undefined, kind: ATFormKind | undefined): ATRisk {
  if (!info || !kind) return 'unknown';
  if (kind === 'read' || kind === 'test') return 'safe';
  return info.risk;
}

/** The part of a form's syntax to type before filling in parameters. */
export function insertTextFor(syntax: string): string {
  const cut = syntax.search(/[<[]/);
  return cut === -1 ? syntax : syntax.slice(0, cut);
}

/**
 * Where a set form's arguments start: after "=" for extended commands, after
 * the name for basic ones (ATE<n>). Quotes stay part of each argument, so
 * values like "SM" can be inserted as they are listed.
 */
export function setPrefixFor(syntax: string): string {
  const eq = syntax.indexOf('=');
  return eq === -1 ? insertTextFor(syntax) : syntax.slice(0, eq + 1);
}

/**
 * Sets parameter `position` of a set-form command, keeping the others the
 * user already typed. Arguments are split on commas, which is enough for the
 * catalog's parameter values (none contain a comma).
 */
export function withParam(input: string, prefix: string, position: number, value: string): string {
  const current = input.toUpperCase().startsWith(prefix.toUpperCase())
    ? input.slice(prefix.length)
    : '';
  const args = current === '' ? [] : current.split(',');
  while (args.length <= position) args.push('');
  args[position] = value;
  while (args.length > 1 && args[args.length - 1] === '') args.pop();
  return prefix + args.join(',');
}

export interface Suggestion {
  key: string;
  syntax: string;
  insert: string;
  description: string;
  info?: ATCommandInfo;
}

/** Every form of every catalog command, plus modem-reported commands the catalog lacks. */
export function buildSuggestions(catalog: ATCatalog): Suggestion[] {
  const suggestions: Suggestion[] = catalog.commands.flatMap((info) =>
    info.forms.map((form) => ({
      key: form.syntax,
      syntax: form.syntax,
      insert: insertTextFor(form.syntax),
      description: `${info.title} — ${form.description}`,
      info,
    })),
  );
  const known = new Set(catalog.commands.map((c) => c.name));
  for (const name of catalog.supported ?? []) {
    if (known.has(name)) continue;
    suggestions.push({
      key: `clac:${name}`,
      syntax: `AT${name}`,
      insert: `AT${name}`,
      description: 'Reported by this modem, not documented here',
    });
  }
  return suggestions;
}

/** Ranks suggestions for the typed text: syntax prefix, then name, then words. */
export function matchSuggestions(all: Suggestion[], input: string, limit = 8): Suggestion[] {
  const q = input.trim();
  if (q === '') return [];
  const upper = q.toUpperCase();
  const token = upper.replace(/^AT/, '');
  const words = q.toLowerCase();

  const scored: { s: Suggestion; score: number }[] = [];
  for (const s of all) {
    const syntax = s.syntax.toUpperCase();
    let score = -1;
    if (syntax.startsWith(upper)) score = 0;
    else if (token && syntax.slice(2).includes(token)) score = 1;
    else if (words.length > 1 && s.description.toLowerCase().includes(words)) score = 2;
    if (score >= 0) scored.push({ s, score });
  }
  scored.sort((a, b) => a.score - b.score || a.s.syntax.length - b.s.syntax.length);
  return scored.slice(0, limit).map((x) => x.s);
}

// --- Response decoding ---

const REG_STATUS: Record<string, string> = {
  '0': 'not registered, not searching',
  '1': 'registered on the home network',
  '2': 'not registered, searching',
  '3': 'registration denied',
  '4': 'unknown',
  '5': 'registered, roaming',
};

const ACCESS_TECH: Record<string, string> = {
  '0': 'GSM',
  '2': '3G (UTRAN)',
  '3': 'GSM/EDGE',
  '7': '4G (LTE)',
};

const CME_ERRORS: Record<string, string> = {
  '3': 'operation not allowed',
  '4': 'operation not supported',
  '10': 'SIM not inserted',
  '11': 'SIM PIN required',
  '12': 'SIM PUK required',
  '13': 'SIM failure',
  '14': 'SIM busy',
  '15': 'SIM wrong',
  '16': 'incorrect password',
  '30': 'no network service',
  '31': 'network timeout',
  '100': 'unknown error',
};

const CMS_ERRORS: Record<string, string> = {
  '300': 'modem failure',
  '302': 'operation not allowed',
  '303': 'operation not supported',
  '304': 'invalid PDU mode parameter',
  '305': 'invalid text mode parameter',
  '310': 'SIM not inserted',
  '311': 'SIM PIN required',
  '321': 'invalid memory index',
  '322': 'memory full',
  '330': 'service centre address unknown',
  '331': 'no network service',
  '500': 'unknown error',
};

function args(line: string, prefix: string): string[] {
  return line
    .slice(prefix.length)
    .split(',')
    .map((a) => a.trim().replace(/^"|"$/g, ''));
}

/** Plain-language notes for the parts of a response the console understands. */
export function decodeATResponse(response: string): string[] {
  const notes: string[] = [];
  for (const raw of response.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('+CSQ:')) {
      const [rssi, ber] = args(line, '+CSQ:');
      notes.push(
        rssi === '99'
          ? 'Signal: unknown or not detectable'
          : `Signal: ${-113 + 2 * Number(rssi)} dBm (rssi ${rssi} of 31)${
              ber && ber !== '99' ? `, bit error class ${ber}` : ''
            }`,
      );
    } else if (line.startsWith('+CREG:') || line.startsWith('+CGREG:')) {
      const prefix = line.startsWith('+CREG:') ? '+CREG:' : '+CGREG:';
      const a = args(line, prefix);
      // The read form answers <n>,<stat>; unsolicited reports carry only <stat>.
      const stat = a.length >= 2 ? a[1] : a[0];
      const label = prefix === '+CREG:' ? 'Network' : 'Packet data';
      notes.push(`${label}: ${REG_STATUS[stat ?? ''] ?? `status ${stat}`}`);
    } else if (line.startsWith('+CPIN:')) {
      const code = line.slice('+CPIN:'.length).trim();
      notes.push(
        code === 'READY'
          ? 'SIM ready, no PIN needed'
          : code === 'SIM PIN'
            ? 'SIM is waiting for its PIN'
            : code === 'SIM PUK'
              ? 'SIM is blocked and needs the PUK'
              : `SIM state: ${code}`,
      );
    } else if (line.startsWith('+CMGF:')) {
      const [mode] = args(line, '+CMGF:');
      notes.push(mode === '1' ? 'SMS format: text mode' : 'SMS format: PDU mode');
    } else if (line.startsWith('+COPS:') && !line.includes('(')) {
      const [mode, , oper, act] = args(line, '+COPS:');
      const selection =
        mode === '0'
          ? 'automatic'
          : mode === '1'
            ? 'manual'
            : mode === '2'
              ? 'deregistered'
              : `mode ${mode}`;
      notes.push(
        oper
          ? `Operator: ${oper} (${selection}${act && ACCESS_TECH[act] ? `, ${ACCESS_TECH[act]}` : ''})`
          : `No operator selected (${selection})`,
      );
    } else if (line.startsWith('+CPAS:')) {
      const [pas] = args(line, '+CPAS:');
      const states: Record<string, string> = {
        '0': 'ready',
        '3': 'ringing',
        '4': 'call in progress',
      };
      notes.push(`Activity: ${states[pas ?? ''] ?? `status ${pas}`}`);
    } else if (line.startsWith('+CFUN:')) {
      const [fun] = args(line, '+CFUN:');
      const levels: Record<string, string> = { '0': 'minimum', '1': 'full', '4': 'radio off' };
      notes.push(`Functionality: ${levels[fun ?? ''] ?? `level ${fun}`}`);
    } else if (line.startsWith('+CPMS:')) {
      const a = args(line, '+CPMS:');
      for (let i = 0; i + 2 < a.length; i += 3) {
        notes.push(`Storage ${a[i]}: ${a[i + 1]} of ${a[i + 2]} slots used`);
      }
    }
    for (const [prefix, table] of [
      ['+CME ERROR:', CME_ERRORS],
      ['+CMS ERROR:', CMS_ERRORS],
    ] as const) {
      const at = line.indexOf(prefix);
      if (at === -1) continue;
      const code = line.slice(at + prefix.length).trim();
      notes.push(`Error ${code}: ${table[code] ?? 'see the modem documentation'}`);
    }
  }
  return notes;
}
