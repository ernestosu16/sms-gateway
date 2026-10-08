import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n';

interface ResizeHandleProps extends ComponentProps<'div'> {
  /** Accessible name, e.g. "Resize navigation". */
  label: string;
  dragging: boolean;
}

/**
 * Vertical drag handle for the right edge of a resizable panel. Its parent
 * must be positioned. Spread useResizablePanel's handleProps onto it: drag to
 * resize, double-click to reset, arrow keys and Home when focused.
 */
export function ResizeHandle({ label, dragging, className, ...props }: ResizeHandleProps) {
  const { t } = useI18n();
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      title={t('resize.hint')}
      {...props}
      className={cn(
        'group absolute inset-y-0 -right-1.5 z-10 w-3 cursor-col-resize touch-none focus-visible:outline-none',
        className,
      )}
    >
      <span
        className={cn(
          'absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors group-hover:bg-primary group-focus-visible:bg-primary',
          dragging && 'bg-primary',
        )}
      />
    </div>
  );
}
