import { cn } from '@/lib/cn';
import { describePhone } from '@/lib/phone';

// A fixed palette keeps each contact's color stable across renders and
// sessions without storing anything. Soft tones follow the theme tokens.
const TONES = [
  'bg-primary-soft text-primary-soft-fg',
  'bg-success-soft text-success-soft-fg',
  'bg-warning-soft text-warning-soft-fg',
  'bg-accent-soft text-accent-soft-fg',
  'bg-danger-soft text-danger-soft-fg',
  'bg-neutral-soft text-neutral-soft-fg',
];

function toneFor(phone: string): string {
  let hash = 0;
  for (const ch of phone) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return TONES[Math.abs(hash) % TONES.length] ?? TONES[0]!;
}

/** Up to two initials from a contact name: "Jane Doe" → "JD". */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.map((w) => [...w!][0]!.toUpperCase()).join('');
}

/**
 * Named contacts show their initials with the country flag as a corner badge.
 * Unnamed international numbers show the flag, alphanumeric senders ("BANK")
 * their initial, and anything else (short codes) a person glyph.
 */
export default function Avatar({
  phone,
  name,
  size = 'md',
}: {
  phone: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const isNumber = /^\+?\d+$/.test(phone);
  const { flag, countryName } = describePhone(phone);

  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'sm' && 'h-8 w-8 text-xs',
        size === 'md' && 'h-10 w-10 text-sm',
        size === 'lg' && 'h-16 w-16 text-xl',
        toneFor(phone),
      )}
    >
      {name ? (
        <>
          {initials(name)}
          {flag && size !== 'sm' && (
            <span
              className={cn(
                'absolute -right-1 -bottom-1 flex items-center justify-center rounded-full bg-surface leading-none ring-2 ring-surface',
                size === 'lg' ? 'h-7 w-7 text-lg' : 'h-5 w-5 text-xs',
              )}
              title={countryName}
            >
              {flag}
            </span>
          )}
        </>
      ) : flag ? (
        <span
          className={cn('leading-none', size === 'lg' ? 'text-3xl' : 'text-lg')}
          title={countryName}
        >
          {flag}
        </span>
      ) : isNumber ? (
        <svg className="h-1/2 w-1/2" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z" />
        </svg>
      ) : (
        phone.charAt(0).toUpperCase()
      )}
    </div>
  );
}
