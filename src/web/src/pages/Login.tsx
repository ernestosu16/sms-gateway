import { useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import AuthShell from '@/components/AuthShell';
import { Alert, Button, Field, Input } from '@/components/ui';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

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
        isAxiosError(err) && err.response?.status === 429
          ? 'Too many failed attempts. Try again in a few minutes.'
          : 'Invalid username or password',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Sign in" description="Use your gateway account to continue.">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Username" htmlFor="username">
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
        <Field label="Password" htmlFor="password">
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
          {loading ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  );
}
