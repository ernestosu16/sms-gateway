import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import AuthShell from '@/components/AuthShell';
import { Alert, Button, Field, Input } from '@/components/ui';

export default function ChangePassword() {
  const { mustChangePassword, completePasswordChange } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
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
    } catch {
      setError('Failed to change password. Check your current password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Change Password"
      description={
        mustChangePassword && (
          <span className="text-warning">You must change your password before continuing.</span>
        )
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Current Password" htmlFor="currentPassword">
          <Input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </Field>
        <Field label="New Password" htmlFor="newPassword" hint="At least 8 characters.">
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
        <Field label="Confirm New Password" htmlFor="confirmPassword">
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
          {loading ? 'Changing...' : 'Change Password'}
        </Button>
      </form>
    </AuthShell>
  );
}
