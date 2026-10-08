import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { notifyConversationsChanged, type Contact } from '@/lib/messages';

/**
 * Loads and edits the saved name for one number. Saving an empty name removes
 * the contact, leaving the number unnamed.
 */
export function useContact(phone: string) {
  const [name, setName] = useState('');

  useEffect(() => {
    let cancelled = false;
    setName('');
    // q matches by substring, so pick the exact number out of the results.
    api
      .get<Contact[]>('/contacts', { params: { q: phone } })
      .then((res) => {
        if (!cancelled) setName(res.data.find((c) => c.phone_number === phone)?.name ?? '');
      })
      .catch(() => {
        // Unnamed is a safe fallback; the number still shows.
      });
    return () => {
      cancelled = true;
    };
  }, [phone]);

  const save = useCallback(
    async (next: string) => {
      const trimmed = next.trim();
      if (trimmed) {
        const res = await api.put<Contact>('/contacts', { name: trimmed }, { params: { phone } });
        setName(res.data.name);
      } else {
        await api.delete('/contacts', { params: { phone } }).catch((err) => {
          // Already unnamed is the outcome we wanted.
          if (err?.response?.status !== 404) throw err;
        });
        setName('');
      }
      notifyConversationsChanged();
    },
    [phone],
  );

  return { name, save };
}
