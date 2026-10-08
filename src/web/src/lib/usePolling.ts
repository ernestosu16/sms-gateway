import { useEffect, useRef } from 'react';

/**
 * Calls `fn` every `intervalMs` while the tab is visible, and once immediately
 * when it becomes visible again so returning to the tab shows fresh data.
 *
 * Polling stops entirely while `enabled` is false.
 */
export function usePolling(fn: () => void, intervalMs: number, enabled = true): void {
  // Keeping the latest callback in a ref lets the interval survive re-renders
  // instead of being torn down every time the caller's closure changes.
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (!document.hidden) fnRef.current();
    };
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs, enabled]);
}
