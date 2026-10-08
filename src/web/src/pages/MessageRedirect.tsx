import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '@/lib/api';
import { chatPath, type Message } from '@/lib/messages';
import { Alert, Button, LoadingState } from '@/components/ui';

/**
 * Keeps old /messages/:id links working now that messages live in threads: it
 * looks the message up and opens its conversation scrolled to it.
 */
export default function MessageRedirect() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Message>(`/sms/${id}`)
      .then((res) => {
        if (!cancelled)
          navigate(`${chatPath(res.data.phone_number)}#msg-${res.data.id}`, { replace: true });
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  if (!error) return <LoadingState label="Opening message…" />;

  return (
    <div className="space-y-4">
      <Alert>Message not found.</Alert>
      <Button variant="secondary" onClick={() => navigate('/chats')}>
        Back to messages
      </Button>
    </div>
  );
}
