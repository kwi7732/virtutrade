'use client';

import dynamic from 'next/dynamic';

const AppShell = dynamic(() => import('./AppShell'), { 
  ssr: false,
  loading: () => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#0b0e11',
    }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  ),
});

export default function Home() {
  return <AppShell />;
}
