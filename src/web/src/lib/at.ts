/*
 * AT command helpers for the modem console. The catalog's structure comes from
 * GET /modem/at/commands (internal/modem/atcatalog.go) and its wording from
 * locales/atCatalog.*.ts; this file only reads them. parseAT mirrors parseATCommand in internal/modem/atcommand.go so the
 * console can preview a command's risk, but the server re-checks every
 * command and has the final say.
 */

import { getLocale, t, type Language } from '@/lib/i18n';
import type { MessageKey } from '@/locales/en';
import atCatalogEn, { type ATCatalogText } from '@/locales/atCatalog.en';
import atCatalogEs from '@/locales/atCatalog.es';

export type ATRisk = 'safe' | 'config' | 'dangerous' | 'unknown';
export type ATFormKind = 'execute' | 'read' | 'test' | 'set';

export interface ATForm {
  kind: ATFormKind;
  syntax: string;
}

export interface ATParam {
  name: string;
  values?: string[];
}

export interface ATCommandInfo {
  name: string;
  category: string;
  forms: ATForm[];
  params?: ATParam[];
  response?: string;
  example?: string;
  risk: Exclude<ATRisk, 'unknown'>;
  reference?: string;
}

export interface ATCatalog {
  commands: ATCommandInfo[];
  /** Names the modem reported through AT+CLAC, or null if it cannot say. */
  supported: string[] | null;
}

const catalogText: Record<Language, Record<string, ATCatalogText>> = {
  en: atCatalogEn,
  es: atCatalogEs,
};

const NO_TEXT: ATCatalogText = { title: '', description: '', forms: {} };

/**
 * Wording of a catalog command in the active language. A command the server
 * knows but the WebUI does not yet document gets empty text, not an error.
 */
export function atText(name: string): ATCatalogText {
  return catalogText[getLocale()][name] ?? NO_TEXT;
}

const CATEGORIES: Record<string, MessageKey> = {
  General: 'at.category.general',
  Device: 'at.category.device',
  Network: 'at.category.network',
  SIM: 'at.category.sim',
  SMS: 'at.category.sms',
  Calls: 'at.category.calls',
};

/** Catalog category in the active language. */
export function atCategory(category: string): string {
  const key = CATEGORIES[category];
  return key ? t(key) : category;
}

/** Same rules as ValidateATCommand on the server. */
export function validateAT(cmd: string): string | null {
  if (cmd === '') return null;
  if (cmd.length > 256) return t('at.error.length');
  if (!/^[\x20-\x7e]*$/.test(cmd)) return t('at.error.ascii');
  if (!/^at/i.test(cmd)) return t('at.error.prefix');
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
  const suggestions: Suggestion[] = catalog.commands.flatMap((info) => {
    const text = atText(info.name);
    return info.forms.map((form) => ({
      key: form.syntax,
      syntax: form.syntax,
      insert: insertTextFor(form.syntax),
      description: [text.title, text.forms[form.kind]].filter(Boolean).join(' — '),
      info,
    }));
  });
  const known = new Set(catalog.commands.map((c) => c.name));
  for (const name of catalog.supported ?? []) {
    if (known.has(name)) continue;
    suggestions.push({
      key: `clac:${name}`,
      syntax: `AT${name}`,
      insert: `AT${name}`,
      description: t('at.reportedSuggestion'),
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

const REG_STATUS: Record<string, MessageKey> = {
  '0': 'atNote.reg.0',
  '1': 'atNote.reg.1',
  '2': 'atNote.reg.2',
  '3': 'atNote.reg.3',
  '4': 'atNote.reg.4',
  '5': 'atNote.reg.5',
};

const ACCESS_TECH: Record<string, string> = {
  '0': 'GSM',
  '2': '3G (UTRAN)',
  '3': 'GSM/EDGE',
  '7': '4G (LTE)',
};

const CME_ERRORS: Record<string, MessageKey> = {
  '3': 'atNote.err.notAllowed',
  '4': 'atNote.err.notSupported',
  '10': 'atNote.err.simNotInserted',
  '11': 'atNote.err.simPin',
  '12': 'atNote.err.simPuk',
  '13': 'atNote.err.simFailure',
  '14': 'atNote.err.simBusy',
  '15': 'atNote.err.simWrong',
  '16': 'atNote.err.password',
  '30': 'atNote.err.noService',
  '31': 'atNote.err.timeout',
  '100': 'atNote.err.unknown',
};

const CMS_ERRORS: Record<string, MessageKey> = {
  '300': 'atNote.err.modem',
  '302': 'atNote.err.notAllowed',
  '303': 'atNote.err.notSupported',
  '304': 'atNote.err.pduParam',
  '305': 'atNote.err.textParam',
  '310': 'atNote.err.simNotInserted',
  '311': 'atNote.err.simPin',
  '321': 'atNote.err.memoryIndex',
  '322': 'atNote.err.memoryFull',
  '330': 'atNote.err.smsc',
  '331': 'atNote.err.noService',
  '500': 'atNote.err.unknown',
};

const ACTIVITY: Record<string, MessageKey> = {
  '0': 'atNote.activity.0',
  '3': 'atNote.activity.3',
  '4': 'atNote.activity.4',
};

const FUNCTIONALITY: Record<string, MessageKey> = {
  '0': 'atNote.fun.0',
  '1': 'atNote.fun.1',
  '4': 'atNote.fun.4',
};

function args(line: string, prefix: string): string[] {
  return line
    .slice(prefix.length)
    .split(',')
    .map((a) => a.trim().replace(/^"|"$/g, ''));
}

/** Translates a code through a table, or says which code it was. */
function lookup(table: Record<string, MessageKey>, code: string | undefined, fallback: string) {
  const key = table[code ?? ''];
  return key ? t(key) : fallback;
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
          ? t('atNote.signalUnknown')
          : t('atNote.signal', { dbm: -113 + 2 * Number(rssi), rssi: rssi ?? '' }) +
              (ber && ber !== '99' ? t('atNote.ber', { ber }) : ''),
      );
    } else if (line.startsWith('+CREG:') || line.startsWith('+CGREG:')) {
      const prefix = line.startsWith('+CREG:') ? '+CREG:' : '+CGREG:';
      const a = args(line, prefix);
      // The read form answers <n>,<stat>; unsolicited reports carry only <stat>.
      const stat = a.length >= 2 ? a[1] : a[0];
      const status = lookup(REG_STATUS, stat, t('atNote.statusCode', { code: stat ?? '' }));
      notes.push(t(prefix === '+CREG:' ? 'atNote.network' : 'atNote.packet', { status }));
    } else if (line.startsWith('+CPIN:')) {
      const code = line.slice('+CPIN:'.length).trim();
      notes.push(
        code === 'READY'
          ? t('atNote.simReady')
          : code === 'SIM PIN'
            ? t('atNote.simPin')
            : code === 'SIM PUK'
              ? t('atNote.simPuk')
              : t('atNote.simState', { state: code }),
      );
    } else if (line.startsWith('+CMGF:')) {
      const [mode] = args(line, '+CMGF:');
      notes.push(mode === '1' ? t('atNote.textMode') : t('atNote.pduMode'));
    } else if (line.startsWith('+COPS:') && !line.includes('(')) {
      const [mode, , oper, act] = args(line, '+COPS:');
      const selection =
        mode === '0'
          ? t('atNote.automatic')
          : mode === '1'
            ? t('atNote.manual')
            : mode === '2'
              ? t('atNote.deregistered')
              : t('atNote.mode', { mode: mode ?? '' });
      const details = act && ACCESS_TECH[act] ? `${selection}, ${ACCESS_TECH[act]}` : selection;
      notes.push(
        oper
          ? t('atNote.operator', { operator: oper, details })
          : t('atNote.noOperator', { details: selection }),
      );
    } else if (line.startsWith('+CPAS:')) {
      const [pas] = args(line, '+CPAS:');
      const state = lookup(ACTIVITY, pas, t('atNote.statusCode', { code: pas ?? '' }));
      notes.push(t('atNote.activity', { state }));
    } else if (line.startsWith('+CFUN:')) {
      const [fun] = args(line, '+CFUN:');
      const level = lookup(FUNCTIONALITY, fun, t('atNote.level', { level: fun ?? '' }));
      notes.push(t('atNote.functionality', { level }));
    } else if (line.startsWith('+CPMS:')) {
      const a = args(line, '+CPMS:');
      for (let i = 0; i + 2 < a.length; i += 3) {
        notes.push(
          t('atNote.storage', { name: a[i] ?? '', used: a[i + 1] ?? '', total: a[i + 2] ?? '' }),
        );
      }
    }
    for (const [prefix, table] of [
      ['+CME ERROR:', CME_ERRORS],
      ['+CMS ERROR:', CMS_ERRORS],
    ] as const) {
      const at = line.indexOf(prefix);
      if (at === -1) continue;
      const code = line.slice(at + prefix.length).trim();
      notes.push(t('atNote.error', { code, reason: lookup(table, code, t('atNote.seeDocs')) }));
    }
  }
  return notes;
}
