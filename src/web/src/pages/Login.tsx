import { useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import AuthShell from '@/components/AuthShell';
import { Alert, Button, Field, Input } from '@/components/ui';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(
        isAxiosError(err) && err.response?.status === 429 ? t('login.tooMany') : t('login.invalid'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title={t('login.title')} description={t('login.description')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label={t('common.username')} htmlFor="username">
          <Input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
          />
        </Field>
        <Field label={t('common.password')} htmlFor="password">
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </Field>
        <Button type="submit" loading={loading} className="w-full">
          {loading ? t('login.submitting') : t('login.submit')}
        </Button>
      </form>
    </AuthShell>
  );
}
