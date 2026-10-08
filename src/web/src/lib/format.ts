import { getLocale, t } from '@/lib/i18n';

/** Number with the active language's digit grouping. */
export function formatNumber(n: number): string {
  return n.toLocaleString(getLocale());
}

/** Short human distance from now, falling back to a date after a week. */
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return t('date.justNow');
  const relative = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'always' });
  if (diffMin < 60) return relative.format(-diffMin, 'minute');
  if (diffHour < 24) return relative.format(-diffHour, 'hour');
  if (diffDay < 7) return relative.format(-diffDay, 'day');
  return date.toLocaleDateString(getLocale());
}

/** Full timestamp down to the second, for detail views. */
export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(getLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Date with hour and minute, for record lists (API keys, users, webhooks). */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(getLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Compact timestamp for the conversation list: time today, weekday this week, else date. */
export function formatListTime(dateStr: string): string {
  const date = new Date(dateStr);
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY_MS);
  if (days <= 0) return formatTime(dateStr);
  if (days === 1) return t('date.yesterday');
  if (days < 7) return date.toLocaleDateString(getLocale(), { weekday: 'short' });
  return date.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' });
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(getLocale(), { hour: 'numeric', minute: '2-digit' });
}

/** Time with seconds, for console transcripts. */
export function formatTimeWithSeconds(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(getLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Label for the separator between days in a thread. */
export function formatDayLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY_MS);
  if (days <= 0) return t('date.today');
  if (days === 1) return t('date.yesterday');
  return date.toLocaleDateString(getLocale(), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

export function isSameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}
