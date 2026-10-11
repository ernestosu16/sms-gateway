import { isAxiosError } from 'axios';
import en, { type MessageKey } from '@/locales/en';
import { t, type TranslateParams } from '@/lib/i18n';

/** Error body the API sends: an English message plus a code the UI translates. */
interface ApiErrorBody {
  error?: string;
  code?: string;
  params?: Record<string, unknown>;
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === 'object' && value !== null;
}

/**
 * Translates an error body by its code. A param may itself be an error body
 * (e.g. why a profile command was refused), which is translated first.
 */
function translate(body: ApiErrorBody): string | undefined {
  const key = `apiError.${body.code}`;
  if (!body.code || !(key in en)) return undefined;
  const params: TranslateParams = {};
  for (const [name, value] of Object.entries(body.params ?? {})) {
    params[name] = isErrorBody(value) ? (translate(value) ?? value.error ?? '') : String(value);
  }
  return t(key as MessageKey, params);
}

/**
 * The server's reason for a failed request in the active language, or fallback
 * when it sent none the UI can translate (including server failures, whose
 * English text is only diagnostic).
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const body = isAxiosError(err) ? err.response?.data : undefined;
  return (isErrorBody(body) && translate(body)) || fallback;
}
