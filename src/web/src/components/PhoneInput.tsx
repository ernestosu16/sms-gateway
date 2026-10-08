import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { describeTyping, toInternational } from '@/lib/phone';
import { CheckCircleIcon, GlobeIcon } from '@/components/ui';

interface PhoneInputProps extends Omit<
  ComponentProps<'input'>,
  'value' | 'onChange' | 'type' | 'size'
> {
  /** The number in stored form: "" or "+" followed by digits. */
  value: string;
  onChange: (e164: string) => void;
  /** field: a bordered form control. bare: borderless, for a header bar. */
  variant?: 'field' | 'bare';
}

/**
 * International phone number input. The "+" is added automatically, the
 * number is formatted as it is typed, and the country is detected from the
 * calling code and shown as a flag with its name.
 */
export default function PhoneInput({
  value,
  onChange,
  variant = 'field',
  className,
  ...props
}: PhoneInputProps) {
  const details = describeTyping(value);
  const digits = value.length - 1;
  // Only flag a probable typo once the number is long enough to judge.
  const looksWrong = details.country !== undefined && !details.valid && digits >= 10;

  return (
    <div className={cn('min-w-0', className)}>
      <div
        className={cn(
          'flex min-w-0 items-center gap-2',
          variant === 'field' &&
            'rounded-lg border border-border-strong bg-field px-3 shadow-sm transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25',
        )}
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-base leading-none"
          title={details.countryName}
          aria-hidden="true"
        >
          {details.flag ?? <GlobeIcon className="h-4 w-4 text-fg-subtle" />}
        </span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={details.formatted}
          onChange={(e) => onChange(toInternational(e.target.value))}
          placeholder="+1 555 123 4567"
          className="min-w-0 flex-1 bg-transparent py-2 text-base text-fg placeholder:text-fg-subtle focus:outline-none sm:text-sm"
          {...props}
        />
        {details.valid && (
          <span className="shrink-0 text-success" title="Valid number">
            <CheckCircleIcon className="h-4 w-4" />
            <span className="sr-only">Valid number</span>
          </span>
        )}
      </div>
      <p
        aria-live="polite"
        className={cn('mt-1 truncate text-xs', looksWrong ? 'text-warning' : 'text-fg-subtle')}
      >
        {!value
          ? 'Start with the country code — the + is added for you.'
          : details.countryName
            ? `${details.countryName} · +${details.callingCode}${looksWrong ? ' · check the number' : ''}`
            : details.callingCode
              ? `Country code +${details.callingCode}`
              : 'Keep typing the country code…'}
      </p>
    </div>
  );
}
