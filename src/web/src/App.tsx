import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import Layout from '@/components/Layout';
import { MessageActivityProvider } from '@/lib/messageActivity';
import Login from '@/pages/Login';
import ChangePassword from '@/pages/ChangePassword';
import MessageRedirect from '@/pages/MessageRedirect';
import APIKeys from '@/pages/APIKeys';
import Webhooks from '@/pages/Webhooks';
import Users from '@/pages/Users';
import ModemTest from '@/pages/ModemTest';
import ModemSetup from '@/pages/ModemSetup';
import { lazy, type ReactNode } from 'react';

// The phone-number metadata (libphonenumber-js) is only needed by these
// pages, so they load on demand and keep it out of the initial bundle.
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Chats = lazy(() => import('@/pages/Chats'));
const Contacts = lazy(() => import('@/pages/Contacts'));

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, mustChangePassword } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/change-password" element={<ChangePassword />} />
      <Route
        element={
          <ProtectedRoute>
            <MessageActivityProvider>
              <Layout />
            </MessageActivityProvider>
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/chats" element={<Chats />} />
        <Route path="/chats/new" element={<Chats />} />
        <Route path="/chats/:phone" element={<Chats />} />
        <Route path="/contacts" element={<Contacts />} />
        {/* Pre-chat pages, kept so bookmarks and old links still resolve. */}
        <Route path="/inbox" element={<Navigate to="/chats" replace />} />
        <Route path="/outbox" element={<Navigate to="/chats" replace />} />
        <Route path="/send" element={<Navigate to="/chats/new" replace />} />
        <Route path="/messages/:id" element={<MessageRedirect />} />
        <Route path="/apikeys" element={<APIKeys />} />
        <Route path="/webhooks" element={<Webhooks />} />
        <Route path="/users" element={<Users />} />
        <Route path="/modem" element={<ModemTest />} />
        <Route path="/modem-setup" element={<ModemSetup />} />
      </Route>
    </Routes>
  );
}
