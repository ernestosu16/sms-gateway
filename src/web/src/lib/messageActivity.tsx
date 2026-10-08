import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import api from '@/lib/api';
import { notifyConversationsChanged, onConversationsChanged } from '@/lib/messages';
import { usePolling } from '@/lib/usePolling';

/** How often the app re-checks the server for message activity. The modem itself polls every 10s. */
export const ACTIVITY_POLL_MS = 5000;

// Whole-table counts from /sms/stats. Deriving these from a page of messages
// would report the page size instead of the real total.
export interface MessageStats {
  total: number;
  inbound: number;
  outbound: number;
  unread: number;
  sent: number;
  pending: number;
  failed: number;
  /** Keyed "<direction>.<status>", e.g. "outbound.sent". */
  by_status: Record<string, number>;
}

/**
 * Collapses the per-status counts into one comparable string. A new message
 * raises a count, a delivery or read moves one between statuses, and a delete
 * lowers one, so any change to the messages table changes this value.
 */
function fingerprint(stats: MessageStats): string {
  return Object.keys(stats.by_status)
    .sort()
    .map((key) => `${key}=${stats.by_status[key]}`)
    .join(',');
}

const MessageStatsContext = createContext<MessageStats | null>(null);

/**
 * Watches for message activity in the background with one cheap stats request,
 * shares the counts with the nav badge and the dashboard, and announces changes
 * through notifyConversationsChanged so open views re-fetch only when something
 * actually happened: a message arrived, was sent, changed status or was deleted.
 */
export function MessageActivityProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<MessageStats | null>(null);
  const lastFingerprint = useRef<string | null>(null);

  const fetchStats = useCallback(() => {
    api
      .get<MessageStats>('/sms/stats')
      .then((res) => {
        setStats(res.data);
        const next = fingerprint(res.data);
        const changed = lastFingerprint.current !== null && lastFingerprint.current !== next;
        lastFingerprint.current = next;
        // The re-fetch this event triggers below comes back unchanged, so it
        // does not announce again.
        if (changed) notifyConversationsChanged();
      })
      .catch(() => {
        // Keep the last known counts; the next poll retries.
      });
  }, []);

  // Local actions (read, send, delete) announce themselves; refreshing here
  // keeps the badge in step without waiting for the next poll.
  useEffect(() => {
    fetchStats();
    return onConversationsChanged(fetchStats);
  }, [fetchStats]);
  usePolling(fetchStats, ACTIVITY_POLL_MS);

  const unread = stats?.unread ?? 0;
  useEffect(() => {
    const base = document.title;
    if (unread > 0) document.title = `(${unread > 99 ? '99+' : unread}) ${base}`;
    return () => {
      document.title = base;
    };
  }, [unread]);

  return <MessageStatsContext.Provider value={stats}>{children}</MessageStatsContext.Provider>;
}

/** Latest message counts, or null until the first response arrives. */
export function useMessageStats(): MessageStats | null {
  return useContext(MessageStatsContext);
}
