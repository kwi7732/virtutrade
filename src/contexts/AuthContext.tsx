'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface AppUser {
  uid: string;
  email: string;
  displayName: string;
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<string | null>;
  signup: (email: string, password: string, displayName: string) => Promise<string | null>;
  logout: () => Promise<void>;
  isDemoMode: boolean;
  demoLogin: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

function mapSupabaseUser(u: SupabaseUser): AppUser {
  return {
    uid: u.id,
    email: u.email || '',
    displayName: u.user_metadata?.display_name || u.user_metadata?.full_name || u.email?.split('@')[0] || 'User',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const isDemoMode = !isSupabaseConfigured;

  useEffect(() => {
    if (isDemoMode) {
      const savedUser = localStorage.getItem('virtutrade-demo-user');
      if (savedUser) setUser(JSON.parse(savedUser));
      setLoading(false);
      return;
    }
    if (!supabase) { setLoading(false); return; }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser(mapSupabaseUser(session.user));
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) setUser(mapSupabaseUser(session.user));
      else setUser(null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [isDemoMode]);

  const loginWithGoogle = async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });
  };

  const loginWithEmail = async (email: string, password: string): Promise<string | null> => {
    if (!supabase) return 'DB not configured';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  };

  const signup = async (email: string, password: string, displayName: string): Promise<string | null> => {
    if (!supabase) return 'DB not configured';
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { display_name: displayName } },
    });
    return error ? error.message : null;
  };

  const demoLogin = () => {
    const demoUser: AppUser = {
      uid: 'demo-' + Date.now(),
      email: 'demo@virtutrade.com',
      displayName: 'Demo Trader',
    };
    setUser(demoUser);
    localStorage.setItem('virtutrade-demo-user', JSON.stringify(demoUser));
  };

  const logout = async () => {
    if (isDemoMode) {
      setUser(null);
      localStorage.removeItem('virtutrade-demo-user');
      return;
    }
    if (supabase) await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user, loading, loginWithGoogle, loginWithEmail, signup, logout, isDemoMode, demoLogin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
