import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { chatPath, type Message } from '@/lib/messages';
import { Alert, Button, LoadingState } from '@/components/ui';

/**
 * Keeps old /messages/:id links working now that messages live in threads: it
 * looks the message up and opens its conversation scrolled to it.
 */
export default function MessageRedirect() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
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

  if (!error) return <LoadingState label={t('redirect.opening')} />;

  return (
    <div className="space-y-4">
      <Alert>{t('redirect.notFound')}</Alert>
      <Button variant="secondary" onClick={() => navigate('/chats')}>
        {t('redirect.back')}
      </Button>
    </div>
  );
}
