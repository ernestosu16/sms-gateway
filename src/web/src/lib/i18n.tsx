import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import en, { type MessageKey } from '@/locales/en';
import es from '@/locales/es';

export type Language = 'en' | 'es';
/** What the user picked: a fixed language, or whatever the browser prefers. */
export type LanguagePreference = Language | 'auto';
export type TranslateParams = Record<string, string | number>;

export const LANGUAGES: Language[] = ['en', 'es'];
const FALLBACK: Language = 'en';
const STORAGE_KEY = 'sms-gateway.language';

const dictionaries: Record<Language, Record<MessageKey, string>> = { en, es };

/** First browser language we have a translation for, by primary subtag ("es-MX" → "es"). */
function browserLanguage(): Language {
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of preferred) {
    const primary = tag?.toLowerCase().split('-')[0];
    if (LANGUAGES.includes(primary as Language)) return primary as Language;
  }
  return FALLBACK;
}

function resolve(preference: LanguagePreference): Language {
  return preference === 'auto' ? browserLanguage() : preference;
}

function isPreference(value: string | null): value is LanguagePreference {
  return value === 'auto' || LANGUAGES.includes(value as Language);
}

// Storage can be unavailable (private windows, blocked site data); the app
// then follows the browser language for the session.
function loadPreference(): LanguagePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isPreference(saved) ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

function savePreference(preference: LanguagePreference) {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Not remembering the choice is acceptable.
  }
}

// Module-level copy of the active language so plain functions (date
// formatting, hooks' error messages) translate without needing the context.
// Components still read it through useI18n, which re-renders them on change.
let current: Language = resolve(loadPreference());

function interpolate(text: string, params?: TranslateParams): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Translates a key in the active language, filling {placeholders} from params. */
export function t(key: MessageKey, params?: TranslateParams): string {
  return interpolate(dictionaries[current][key] ?? en[key], params);
}

/** BCP 47 tag of the active language, for Intl and toLocale* formatting. */
export function getLocale(): Language {
  return current;
}

export type RichRenderers = Record<string, (chunk: ReactNode) => ReactNode>;

/**
 * Translates a key whose text marks spans with tags, e.g. "Use <code>POST</code>",
 * rendering each span with the renderer of the same name. Placeholders are filled
 * after the tags are split, so a value containing "<" is shown as typed.
 */
export function rich(key: MessageKey, renderers: RichRenderers, params?: TranslateParams) {
  const template = dictionaries[current][key] ?? en[key];
  const parts = template.split(/(<(\w+)>[\s\S]*?<\/\2>)/g);
  const nodes: ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? '';
    const tag = /^<(\w+)>([\s\S]*)<\/\1>$/.exec(part);
    if (tag) {
      const [, name = '', inner = ''] = tag;
      const render = renderers[name];
      const text = interpolate(inner, params);
      nodes.push(<Fragment key={i}>{render ? render(text) : text}</Fragment>);
      i++; // Skip the captured tag name that split() also returns.
    } else if (part) {
      nodes.push(<Fragment key={i}>{interpolate(part, params)}</Fragment>);
    }
  }
  return nodes;
}

interface I18nContextType {
  language: Language;
  preference: LanguagePreference;
  setPreference: (preference: LanguagePreference) => void;
  t: typeof t;
  rich: typeof rich;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<LanguagePreference>(loadPreference);
  const [browser, setBrowser] = useState<Language>(browserLanguage);
  const language = preference === 'auto' ? browser : preference;
  // Set during render so children rendering in this same pass already format
  // and translate in the new language.
  current = language;

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Auto mode follows the browser if its language setting changes.
  useEffect(() => {
    const onChange = () => setBrowser(browserLanguage());
    window.addEventListener('languagechange', onChange);
    return () => window.removeEventListener('languagechange', onChange);
  }, []);

  const setPreference = useCallback((next: LanguagePreference) => {
    savePreference(next);
    setPreferenceState(next);
  }, []);

  // t and rich are module functions; a new object per language makes every
  // consumer re-render when it changes.
  const value = useMemo(
    () => ({ language, preference, setPreference, t, rich }),
    [language, preference, setPreference],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
