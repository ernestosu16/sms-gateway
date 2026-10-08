import { useCallback, useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import api from '@/lib/api';
import {
  compareMessages,
  notifyConversationsChanged,
  onConversationsChanged,
  type Conversation,
  type Message,
  type SendSMSResponse,
} from '@/lib/messages';

const CONVERSATION_PAGE = 30;
// The server clamps limit to 500; asking for more would silently stop growing.
const MAX_CONVERSATIONS = 500;
const THREAD_PAGE = 50;

/**
 * Loads the conversation list and keeps it fresh.
 *
 * Instead of tracking pages, it remembers how many rows the user has scrolled
 * into view and re-fetches that many whenever messages change. One request then
 * refreshes every visible row, so ordering and unread badges never go stale.
 */
export function useConversations(search: string) {
  const [items, setItems] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [count, setCount] = useState(CONVERSATION_PAGE);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  // Drops responses for a search the user has already replaced.
  const requestSeq = useRef(0);

  const fetchList = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const res = await api.get<Conversation[]>('/sms/conversations', {
        params: { q: search || undefined, limit: count },
      });
      if (seq !== requestSeq.current) return;
      setItems(res.data);
      const header = res.headers['x-total-count'];
      setTotal(header !== undefined ? Number(header) : res.data.length);
      setError('');
    } catch {
      if (seq === requestSeq.current) setError('Failed to load conversations.');
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [search, count]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // A new search starts from the first page again.
  useEffect(() => {
    setCount(CONVERSATION_PAGE);
    setLoading(true);
  }, [search]);

  // The background activity watcher and local actions (read, send, delete)
  // announce every change, so the list re-fetches only when something happened.
  useEffect(() => onConversationsChanged(fetchList), [fetchList]);

  const hasMore = items.length < total && count < MAX_CONVERSATIONS;

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    setCount((c) => Math.min(c + CONVERSATION_PAGE, MAX_CONVERSATIONS));
  }, [hasMore, loadingMore]);

  const removeLocal = useCallback((phone: string) => {
    setItems((prev) => prev.filter((c) => c.phone_number !== phone));
    setTotal((t) => Math.max(0, t - 1));
  }, []);

  return {
    items,
    total,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh: fetchList,
    removeLocal,
  };
}

/** A message shown before the server has confirmed it. */
export interface ThreadMessage extends Message {
  /** Set on optimistic messages that have no server id yet. */
  pending?: boolean;
}

/** Merges server messages into the local list by id, keeping it oldest first. */
function mergeMessages(current: ThreadMessage[], incoming: Message[]): ThreadMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort(compareMessages);
}

let tempSeq = 0;

/**
 * Loads one conversation and keeps it live: re-fetches on message activity
 * (new messages, status changes), pages backwards for history, sends optimistically, and marks
 * incoming messages read while the thread is open.
 */
export function useThread(phone: string) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState('');
  // Refreshing pauses while sends are in flight: the server stores the message
  // before the modem finishes, so a fetch could otherwise show it next to its
  // optimistic placeholder. The finished send announces a change, which
  // catches up on anything skipped meanwhile. The ref mirrors the count
  // synchronously so that announcement already sees the send as finished.
  const [inFlight, setInFlight] = useState(0);
  const inFlightRef = useRef(0);
  const phoneRef = useRef(phone);
  phoneRef.current = phone;

  const markRead = useCallback(async () => {
    try {
      await api.put('/sms/conversations/read', null, { params: { phone } });
    } catch {
      return; // Still unread; the next fetch retries.
    }
    if (phoneRef.current !== phone) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.direction === 'inbound' && m.status === 'received' ? { ...m, status: 'read' } : m,
      ),
    );
    notifyConversationsChanged();
  }, [phone]);

  const fetchLatest = useCallback(async () => {
    try {
      const res = await api.get<Message[]>('/sms/conversations/messages', {
        params: { phone, limit: THREAD_PAGE },
      });
      if (phoneRef.current !== phone) return;
      setMessages((prev) => mergeMessages(prev, res.data));
      setError('');
      // An open, visible thread counts as read. Checking on every fetch (not
      // once on mount) also covers messages that arrive while it is open and a
      // thread opened in a background tab.
      if (
        !document.hidden &&
        res.data.some((m) => m.direction === 'inbound' && m.status === 'received')
      ) {
        markRead();
      }
      return res.data;
    } catch {
      if (phoneRef.current === phone) setError('Failed to load messages.');
    }
  }, [phone, markRead]);

  useEffect(() => {
    setMessages([]);
    setLoading(true);
    setHasOlder(false);
    setError('');
    fetchLatest().then((page) => {
      if (phoneRef.current !== phone) return;
      setHasOlder((page?.length ?? 0) === THREAD_PAGE);
      setLoading(false);
    });
  }, [phone, fetchLatest]);

  useEffect(() => {
    const refresh = () => {
      if (inFlightRef.current === 0) fetchLatest();
    };
    // Returning to the tab re-fetches too, so a thread opened in the background
    // gets marked read once it is actually seen.
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    const unsubscribe = onConversationsChanged(refresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      unsubscribe();
    };
  }, [fetchLatest]);

  const loadOlder = useCallback(async () => {
    const oldest = messages.find((m) => !m.pending);
    if (!oldest || loadingOlder || !hasOlder) return;
    setLoadingOlder(true);
    try {
      const res = await api.get<Message[]>('/sms/conversations/messages', {
        params: { phone, limit: THREAD_PAGE, before_id: oldest.id },
      });
      if (phoneRef.current !== phone) return;
      setMessages((prev) => mergeMessages(prev, res.data));
      setHasOlder(res.data.length === THREAD_PAGE);
    } catch {
      setError('Failed to load older messages.');
    } finally {
      setLoadingOlder(false);
    }
  }, [messages, loadingOlder, hasOlder, phone]);

  const send = useCallback(
    async (body: string): Promise<boolean> => {
      const now = new Date().toISOString();
      const temp: ThreadMessage = {
        id: `temp-${++tempSeq}`,
        direction: 'outbound',
        phone_number: phone,
        body,
        status: 'sending',
        created_at: now,
        updated_at: now,
        pending: true,
      };
      setMessages((prev) => [...prev, temp]);
      inFlightRef.current++;
      setInFlight((n) => n + 1);

      try {
        const res = await api.post<SendSMSResponse>('/sms/send', { to: phone, body });
        const confirmed: ThreadMessage = {
          ...temp,
          id: res.data.id,
          status: res.data.status,
          error_message: res.data.status === 'failed' ? res.data.message : undefined,
          pending: false,
        };
        setMessages((prev) => {
          // Swap the placeholder for the real record; keep its position so the
          // bubble does not jump. The re-fetch below fills in the server timestamps.
          const withoutDup = prev.filter((m) => m.id !== confirmed.id);
          return withoutDup.map((m) => (m.id === temp.id ? confirmed : m));
        });
        return res.data.status !== 'failed';
      } catch (err) {
        // A 400 (e.g. a body over the modem's length limit) means the message
        // was never stored, so the reason only exists here.
        const reason =
          (isAxiosError(err) && (err.response?.data as { error?: string } | undefined)?.error) ||
          'Could not reach the server.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === temp.id ? { ...m, status: 'failed', error_message: reason } : m,
          ),
        );
        return false;
      } finally {
        inFlightRef.current--;
        setInFlight((n) => n - 1);
        notifyConversationsChanged();
      }
    },
    [phone],
  );

  /** Deletes a message; placeholders that never reached the server are only dropped locally. */
  const remove = useCallback(async (msg: ThreadMessage) => {
    if (!msg.id.startsWith('temp-')) {
      await api.delete(`/sms/${msg.id}`);
    }
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
  }, []);

  return {
    messages,
    loading,
    loadingOlder,
    hasOlder,
    error,
    loadOlder,
    send,
    remove,
    sending: inFlight > 0,
  };
}
