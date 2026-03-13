'use client';

import Providers from './providers';
import { useAuth } from '@/contexts/AuthContext';
import LoginPage from '@/components/Login/LoginPage';
import TradePage from '@/components/Trade/TradePage';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0b0e11',
      }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <TradePage />;
}

export default function AppShell() {
  return (
    <Providers>
      <AppContent />
    </Providers>
  );
}
