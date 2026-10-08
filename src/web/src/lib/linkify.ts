export type TextPart = { text: string; href?: undefined } | { text: string; href: string };

// Explicit http(s) links and bare "www." hosts. Bare domains ("example.com")
// are left alone: in SMS they collide with file names and abbreviations.
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;

// Punctuation that usually ends the sentence rather than the URL.
const TRAILING_PUNCTUATION = /[.,;:!?'"]+$/;

/** Drops sentence punctuation and an unbalanced closing bracket from a match. */
function trimMatch(url: string): string {
  let out = url.replace(TRAILING_PUNCTUATION, '');
  for (const [open, close] of [
    ['(', ')'],
    ['[', ']'],
  ] as const) {
    while (out.endsWith(close) && out.split(open).length < out.split(close).length) {
      out = out.slice(0, -1).replace(TRAILING_PUNCTUATION, '');
    }
  }
  return out;
}

/**
 * Only http and https URLs become links, so message text from an untrusted
 * sender can never produce a javascript: or data: href.
 */
function safeHref(url: string): string | undefined {
  try {
    const parsed = new window.URL(url.startsWith('www.') ? `https://${url}` : url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

/** Splits message text into plain parts and link parts, in order. */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimMatch(match[0]);
    const href = safeHref(url);
    if (!href) continue;
    const start = match.index;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: url, href });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
