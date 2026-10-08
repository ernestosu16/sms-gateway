import { useEffect, useId, useRef, useState, type ComponentRef } from 'react';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n';
import LanguageControl from '@/components/LanguageControl';
import ThemeModeControl from '@/components/ThemeModeControl';
import { SlidersIcon } from '@/components/ui';

interface PreferencesMenuProps {
  /** Classes for the trigger, so it matches the buttons around it. */
  className?: string;
  /**
   * Positions the panel. It is absolutely positioned against the nearest
   * positioned ancestor, so the caller decides where it opens.
   */
  panelClassName?: string;
}

/**
 * One button that opens language and theme settings in a small panel. The
 * panel uses the surface tokens, so it follows the active light or dark theme
 * wherever the trigger sits (including the always-dark sidebar).
 */
export default function PreferencesMenu({ className, panelClassName }: PreferencesMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<ComponentRef<'div'>>(null);
  const triggerRef = useRef<ComponentRef<'button'>>(null);
  const panelId = useId();

  // Dismiss like a menu: a press outside or Escape closes it. Picking an
  // option keeps it open so the change can be seen and adjusted.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(e.target as globalThis.Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Close only this panel, not the mobile drawer that listens on window.
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('preferences.title')}
        title={t('preferences.title')}
        className={className}
      >
        <SlidersIcon className="h-[18px] w-[18px]" />
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={t('preferences.title')}
          className={cn(
            'absolute z-40 space-y-3 rounded-xl border border-border bg-surface p-3 text-fg shadow-xl',
            panelClassName,
          )}
        >
          <p className="text-sm font-semibold">{t('preferences.title')}</p>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-fg-muted">{t('language.label')}</p>
            <LanguageControl className="flex w-full" />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-fg-muted">{t('preferences.theme')}</p>
            <ThemeModeControl withLabels className="flex w-full" />
          </div>
        </div>
      )}
    </div>
  );
}
