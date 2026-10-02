import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import api from '@/lib/api';

interface User {
  id: string;
  username: string;
  is_admin: boolean;
  must_change_password: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  completePasswordChange: (newToken: string) => void;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('token');
  });

  const login = useCallback(async (username: string, password: string) => {
    const response = await api.post('/auth/login', { username, password });
    const { token: newToken, user: newUser } = response.data;
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    // Revoke the token server-side. The header is set explicitly because the
    // stored token is cleared below, before the request interceptor runs.
    const current = localStorage.getItem('token');
    if (current) {
      api
        .post('/auth/logout', null, { headers: { Authorization: `Bearer ${current}` } })
        .catch(() => {});
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }, []);

  // A password change revokes every earlier token, so the one the API returns
  // replaces ours.
  const completePasswordChange = useCallback(
    (newToken: string) => {
      localStorage.setItem('token', newToken);
      setToken(newToken);
      if (user) {
        const updated = { ...user, must_change_password: false };
        localStorage.setItem('user', JSON.stringify(updated));
        setUser(updated);
      }
    },
    [user],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        completePasswordChange,
        isAuthenticated: !!token,
        mustChangePassword: user?.must_change_password ?? false,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
