import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 400;
export const SIDEBAR_DEFAULT = 256;
/** Width of the icon-only rail. */
export const SIDEBAR_COLLAPSED = 72;
/** Dragging narrower than this collapses to the rail, as in most desktop apps. */
const COLLAPSE_THRESHOLD = 150;
const KEY_STEP = 16;
const STORAGE_KEY = 'sms-gateway.sidebar';

/** The resize handle element. */
type Handle = ComponentRef<'div'>;

interface Stored {
  collapsed: boolean;
  width: number;
}

const clamp = (w: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w));

// Layout preferences are per-browser conveniences; without storage the
// sidebar simply starts expanded at the default width.
function load(): Stored {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    ) as Partial<Stored> | null;
    return {
      collapsed: parsed?.collapsed === true,
      width: typeof parsed?.width === 'number' ? clamp(parsed.width) : SIDEBAR_DEFAULT,
    };
  } catch {
    return { collapsed: false, width: SIDEBAR_DEFAULT };
  }
}

/**
 * State and handlers for a sidebar that can be collapsed to an icon rail and
 * resized by dragging (or with the arrow keys on) its edge handle.
 */
export function useResizableSidebar() {
  const [{ collapsed, width }, setState] = useState(load);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ collapsed, width }));
    } catch {
      // Not remembering the layout is acceptable.
    }
  }, [collapsed, width]);

  const toggle = useCallback(() => setState((s) => ({ ...s, collapsed: !s.collapsed })), []);

  const onPointerDown = (e: PointerEvent<Handle>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startWidth: collapsed ? SIDEBAR_COLLAPSED : width };
    setDragging(true);
  };

  const onPointerMove = (e: PointerEvent<Handle>) => {
    if (!drag.current) return;
    const next = drag.current.startWidth + e.clientX - drag.current.startX;
    setState(
      next < COLLAPSE_THRESHOLD
        ? (s) => ({ ...s, collapsed: true })
        : { collapsed: false, width: clamp(next) },
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
      setState({ collapsed: false, width: SIDEBAR_DEFAULT });
    } else if (delta !== 0) {
      e.preventDefault();
      setState((s) => ({
        collapsed: false,
        width: clamp((s.collapsed ? SIDEBAR_MIN : s.width) + delta),
      }));
    }
  };

  const reset = () => setState({ collapsed: false, width: SIDEBAR_DEFAULT });

  return {
    collapsed,
    width: collapsed ? SIDEBAR_COLLAPSED : width,
    dragging,
    toggle,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onKeyDown,
      onDoubleClick: reset,
    },
  };
}
