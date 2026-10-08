import { cn } from '@/lib/cn';

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

/** Alphanumeric senders ("BANK") get their initial; numbers get a person glyph. */
export default function Avatar({ phone, size = 'md' }: { phone: string; size?: 'sm' | 'md' }) {
  const isNumber = /^\+?\d+$/.test(phone);

  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm',
        toneFor(phone),
      )}
    >
      {isNumber ? (
        <svg className="h-1/2 w-1/2" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z" />
        </svg>
      ) : (
        phone.charAt(0).toUpperCase()
      )}
    </div>
  );
}
