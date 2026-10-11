import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min';
import { getLocale } from '@/lib/i18n';

// E.164 caps a number at 15 digits including the country code.
const MAX_DIGITS = 15;

// One formatter per UI language, created on first use.
const regionNames = new Map<string, Intl.DisplayNames>();

function countryName(country: CountryCode): string {
  if (typeof Intl.DisplayNames !== 'function') return country;
  const locale = getLocale();
  let names = regionNames.get(locale);
  if (!names) {
    names = new Intl.DisplayNames([locale], { type: 'region' });
    regionNames.set(locale, names);
  }
  return names.of(country) ?? country;
}

/** Flag emoji built from the two regional-indicator letters of an ISO code. */
function flagEmoji(country: CountryCode): string {
  return String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export interface PhoneDetails {
  /** International formatting for display, e.g. "+1 555 123 4567". */
  formatted: string;
  /** Calling code without "+", once enough digits are typed to know it. */
  callingCode?: string;
  country?: CountryCode;
  countryName?: string;
  flag?: string;
  /** True when the number matches a real numbering plan for its country. */
  valid: boolean;
}

/**
 * Turns whatever was typed or pasted into the stored form: "+" and digits
 * only. The "+" is implied, so typing "34…" gives "+34…", and a pasted "00"
 * international prefix is dropped (no country code starts with 0).
 */
export function toInternational(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^00/, '').slice(0, MAX_DIGITS);
  return digits ? `+${digits}` : '';
}

/** Live details for a number being typed in international form. */
export function describeTyping(e164: string): PhoneDetails {
  if (!e164) return { formatted: '', valid: false };
  const typer = new AsYouType();
  const formatted = typer.input(e164);
  const country = typer.getCountry();
  return {
    formatted,
    callingCode: typer.getCallingCode(),
    country,
    countryName: country && countryName(country),
    flag: country && flagEmoji(country),
    valid: typer.isValid(),
  };
}

/**
 * Display details for a stored number. Short codes and alphanumeric senders
 * ("BANK") have no country and are shown as stored.
 */
export function describePhone(stored: string): PhoneDetails {
  const parsed = stored.startsWith('+') ? parsePhoneNumberFromString(stored) : undefined;
  if (!parsed) return { formatted: stored, valid: false };
  const country = parsed.country;
  return {
    formatted: parsed.formatInternational(),
    callingCode: parsed.countryCallingCode,
    country,
    countryName: country && countryName(country),
    flag: country && flagEmoji(country),
    valid: parsed.isValid(),
  };
}

export interface CountryOption {
  code: CountryCode;
  name: string;
  flag: string;
  callingCode: string;
}

/** Every country with a numbering plan, sorted by name in the UI language. */
export function listCountries(): CountryOption[] {
  const locale = getLocale();
  return getCountries()
    .map((code) => ({
      code,
      name: countryName(code),
      flag: flagEmoji(code),
      callingCode: getCountryCallingCode(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}
