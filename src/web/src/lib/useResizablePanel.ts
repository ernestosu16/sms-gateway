import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

interface PanelOptions {
  /** localStorage key the width (and collapsed state) is remembered under. */
  storageKey: string;
  min: number;
  max: number;
  defaultWidth: number;
  /**
   * Width when collapsed. Panels without it cannot collapse; panels with it
   * collapse when dragged well below their minimum, as in most desktop apps.
   */
  collapsedWidth?: number;
}

interface Stored {
  collapsed: boolean;
  width: number;
}

const KEY_STEP = 16;

/** The resize handle element. */
type Handle = ComponentRef<'div'>;

/**
 * State and handlers for a panel whose width the user drags (or nudges with
 * the arrow keys) from an edge handle, optionally collapsible to a narrow
 * rail. Pair it with ResizeHandle.
 */
export function useResizablePanel({
  storageKey,
  min,
  max,
  defaultWidth,
  collapsedWidth,
}: PanelOptions) {
  const clamp = useCallback((w: number) => Math.min(max, Math.max(min, w)), [min, max]);
  const canCollapse = collapsedWidth !== undefined;

  // Layout preferences are per-browser conveniences; without storage the
  // panel simply starts expanded at its default width.
  const [{ collapsed, width }, setState] = useState<Stored>(() => {
    try {
      const parsed = JSON.parse(
        localStorage.getItem(storageKey) ?? 'null',
      ) as Partial<Stored> | null;
      return {
        collapsed: canCollapse && parsed?.collapsed === true,
        width: typeof parsed?.width === 'number' ? clamp(parsed.width) : defaultWidth,
      };
    } catch {
      return { collapsed: false, width: defaultWidth };
    }
  });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ collapsed, width }));
    } catch {
      // Not remembering the layout is acceptable.
    }
  }, [storageKey, collapsed, width]);

  const shownWidth = collapsed && canCollapse ? collapsedWidth : width;
  // Halfway between the rail and the minimum: past it, a drag means "collapse".
  const collapseBelow = canCollapse ? (collapsedWidth + min) / 2 : -Infinity;

  const toggle = useCallback(() => {
    if (canCollapse) setState((s) => ({ ...s, collapsed: !s.collapsed }));
  }, [canCollapse]);

  const reset = () => setState({ collapsed: false, width: defaultWidth });

  const onPointerDown = (e: PointerEvent<Handle>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startWidth: shownWidth };
    setDragging(true);
  };

  const onPointerMove = (e: PointerEvent<Handle>) => {
    if (!drag.current) return;
    const next = drag.current.startWidth + e.clientX - drag.current.startX;
    setState(
      next < collapseBelow
        ? (s) => ({ ...s, collapsed: true })
        : { collapsed: false, width: clamp(Math.round(next)) },
    );
  };

  const onPointerUp = (e: PointerEvent<Handle>) => {
    if (!drag.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    drag.current = null;
    setDragging(false);
  };

  const onKeyDown = (e: KeyboardEvent<Handle>) => {
    const delta = e.key === 'ArrowLeft' ? -KEY_STEP : e.key === 'ArrowRight' ? KEY_STEP : 0;
    if (e.key === 'Home') {
      e.preventDefault();
      reset();
    } else if (delta !== 0) {
      e.preventDefault();
      setState((s) => ({
        collapsed: false,
        width: clamp((s.collapsed ? min : s.width) + delta),
      }));
    }
  };

  return {
    collapsed: collapsed && canCollapse,
    width: shownWidth,
    dragging,
    toggle,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onKeyDown,
      onDoubleClick: reset,
      'aria-valuemin': min,
      'aria-valuemax': max,
      'aria-valuenow': shownWidth,
    },
  };
}
