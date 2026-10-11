import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { apiErrorMessage } from '@/lib/apiError';
import { useI18n } from '@/lib/i18n';
import api from '@/lib/api';
import AuthShell from '@/components/AuthShell';
import { Alert, Button, Field, Input } from '@/components/ui';

export default function ChangePassword() {
  const { mustChangePassword, completePasswordChange } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError(t('password.mismatch'));
      return;
    }

    if (newPassword.length < 8) {
      setError(t('password.tooShort'));
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      completePasswordChange(res.data.token);
      navigate('/');
    } catch (err) {
      setError(apiErrorMessage(err, t('password.failed')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={t('password.title')}
      description={
        mustChangePassword && <span className="text-warning">{t('password.mustChange')}</span>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label={t('password.current')} htmlFor="currentPassword">
          <Input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </Field>
        <Field label={t('password.new')} htmlFor="newPassword" hint={t('password.minHint')}>
          <Input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Field>
        <Field label={t('password.confirm')} htmlFor="confirmPassword">
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Field>
        <Button type="submit" loading={loading} className="w-full">
          {loading ? t('password.submitting') : t('password.submit')}
        </Button>
      </form>
    </AuthShell>
  );
}
