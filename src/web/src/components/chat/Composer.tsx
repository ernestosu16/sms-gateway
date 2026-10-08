import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { cn } from '@/lib/cn';
import { MAX_BODY_CHARS } from '@/lib/messages';
import { smsInfo } from '@/lib/sms';
import { SendIcon } from '@/components/ui';

interface ComposerProps {
  /** Resolves true when accepted; on false the draft is restored for another try. */
  onSend: (body: string) => Promise<boolean> | boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}

const MAX_HEIGHT_PX = 160;

export default function Composer({
  onSend,
  disabled,
  autoFocus,
  placeholder = 'Text message',
}: ComposerProps) {
  const [body, setBody] = useState('');
  const textareaRef = useRef<ComponentRef<'textarea'>>(null);

  // Grow with the content up to a cap, then scroll inside the box. Width
  // changes rewrap the text, so a resize re-measures too.
  const fitHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
    // A scrollbar only belongs once the text outgrows the cap.
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT_PX ? 'auto' : 'hidden';
  }, []);

  useEffect(fitHeight, [body, fitHeight]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    let width = el.clientWidth;
    const observer = new window.ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fitHeight();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fitHeight]);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const info = smsInfo(body);
  const length = [...body].length;
  const tooLong = length > MAX_BODY_CHARS;
  const canSend = body.trim() !== '' && !disabled && !tooLong;

  const submit = async () => {
    if (!canSend) return;
    const text = body;
    // Clear right away so the user can keep typing (and send again) while this
    // one is in flight; the draft only comes back if the caller rejects it.
    setBody('');
    textareaRef.current?.focus();
    const ok = await onSend(text);
    if (!ok) setBody((current) => current || text);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e: KeyboardEvent<ComponentRef<'textarea'>>) => {
    // Enter sends and Shift+Enter adds a line, like desktop chat apps. On touch
    // keyboards Enter is the only way to type a newline, so it stays one there.
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !coarse) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="shrink-0 border-t border-border bg-surface px-3 py-2.5 sm:px-4"
    >
      <div className="flex items-end gap-2">
        <label htmlFor="composer" className="sr-only">
          Message
        </label>
        <textarea
          id="composer"
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={tooLong}
          className="block max-h-40 min-h-10 w-full flex-1 resize-none rounded-2xl border border-border-strong bg-field px-4 py-2 text-sm leading-6 text-fg placeholder:text-fg-subtle focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          title="Send (Enter)"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg shadow-sm transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
        >
          <SendIcon className="h-[18px] w-[18px]" />
        </button>
      </div>
      {body !== '' && (
        <p
          aria-live="polite"
          className={cn('mt-1 px-2 text-right text-xs', tooLong ? 'text-danger' : 'text-fg-subtle')}
        >
          {tooLong
            ? `${length}/${MAX_BODY_CHARS} characters — too long to send`
            : `${info.encoding === 'UCS-2' ? 'Unicode · ' : ''}${info.remaining} left · ${info.segments} SMS`}
        </p>
      )}
    </form>
  );
}
