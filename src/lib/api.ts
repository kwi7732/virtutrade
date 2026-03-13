import { supabase, isSupabaseConfigured } from './supabase';

// Get the current session token for API calls
async function getToken(): Promise<string | null> {
  if (!supabase || !isSupabaseConfigured) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

// Authenticated fetch wrapper
async function apiFetch(url: string, options: RequestInit = {}) {
  const token = await getToken();
  if (!token) return null; // Demo mode — skip API calls

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API request failed');
  return data;
}

// ============ API Methods ============

export async function apiLoadUserState() {
  return apiFetch('/api/portfolio');
}

export async function apiMarketOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number) {
  return apiFetch('/api/trade/market', {
    method: 'POST',
    body: JSON.stringify({ symbol, side, quantity }),
  });
}

export async function apiLimitOrder(symbol: string, side: 'BUY' | 'SELL', price: number, quantity: number) {
  return apiFetch('/api/trade/limit', {
    method: 'POST',
    body: JSON.stringify({ symbol, side, price, quantity }),
  });
}

export async function apiCancelOrder(orderId: string) {
  return apiFetch('/api/trade/limit', {
    method: 'DELETE',
    body: JSON.stringify({ orderId }),
  });
}

export { isSupabaseConfigured };
