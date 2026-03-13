import { createServerClient } from './supabase';

const INITIAL_SPOT_BALANCE = 70000;  // USDT
const INITIAL_FUTURES_BALANCE = 30000;
const TRADE_FEE = 0.001;  // 0.1%
const FUTURES_FEE = 0.0004;  // 0.04%

// ============ Types ============
export interface DBPortfolioAsset {
  asset: string;
  balance: number;
  avg_price: number;
}

export interface DBOrder {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  price: number;
  quantity: number;
  filled_quantity: number;
  avg_fill_price: number;
  status: 'OPEN' | 'FILLED' | 'CANCELLED';
  created_at: string;
}

export interface DBFuturesPosition {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  leverage: number;
  entry_price: number;
  quantity: number;
  margin: number;
  liquidation_price: number;
  margin_mode: string;
  status: 'OPEN' | 'CLOSED' | 'LIQUIDATED';
  realized_pnl: number;
  created_at: string;
}

// ============ Portfolio ============
export async function getPortfolio(userId: string): Promise<DBPortfolioAsset[]> {
  const sb = createServerClient();
  if (!sb) return [{ asset: 'USDT', balance: INITIAL_SPOT_BALANCE, avg_price: 1 }];

  const { data, error } = await sb
    .from('portfolios')
    .select('asset, balance, avg_price')
    .eq('user_id', userId);

  if (error || !data || data.length === 0) {
    // First time: create initial portfolio
    await sb.from('portfolios').upsert({
      user_id: userId, asset: 'USDT', balance: INITIAL_SPOT_BALANCE, avg_price: 1,
    }, { onConflict: 'user_id,asset' });
    return [{ asset: 'USDT', balance: INITIAL_SPOT_BALANCE, avg_price: 1 }];
  }

  return data;
}

export async function upsertPortfolioAsset(
  userId: string, asset: string, balance: number, avgPrice: number
) {
  const sb = createServerClient();
  if (!sb) return;

  if (balance <= 0.00000001) {
    await sb.from('portfolios').delete().eq('user_id', userId).eq('asset', asset);
  } else {
    await sb.from('portfolios').upsert({
      user_id: userId, asset, balance: Math.max(0, balance), avg_price: avgPrice,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,asset' });
  }
}

export async function getPortfolioBalance(userId: string, asset: string): Promise<number> {
  const sb = createServerClient();
  if (!sb) return 0;

  const { data } = await sb
    .from('portfolios')
    .select('balance')
    .eq('user_id', userId)
    .eq('asset', asset)
    .single();

  return data?.balance || 0;
}

// ============ Orders ============
export async function getOrders(userId: string, limit = 50): Promise<DBOrder[]> {
  const sb = createServerClient();
  if (!sb) return [];

  const { data } = await sb
    .from('orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return data || [];
}

export async function getOpenLimitOrders(userId: string, symbol?: string): Promise<DBOrder[]> {
  const sb = createServerClient();
  if (!sb) return [];

  let query = sb
    .from('orders')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'OPEN')
    .eq('type', 'LIMIT');

  if (symbol) query = query.eq('symbol', symbol);

  const { data } = await query;
  return data || [];
}

export async function insertOrder(userId: string, order: Omit<DBOrder, 'id' | 'created_at'>) {
  const sb = createServerClient();
  if (!sb) return null;

  const { data, error } = await sb
    .from('orders')
    .insert({ ...order, user_id: userId })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateOrder(orderId: string, updates: Partial<DBOrder>) {
  const sb = createServerClient();
  if (!sb) return;

  await sb.from('orders').update({
    ...updates, updated_at: new Date().toISOString(),
  }).eq('id', orderId);
}

// ============ Futures ============
export async function getFuturesBalance(userId: string) {
  const sb = createServerClient();
  if (!sb) return { balance: INITIAL_FUTURES_BALANCE, margin_used: 0 };

  const { data } = await sb
    .from('futures_balances')
    .select('balance, margin_used')
    .eq('user_id', userId)
    .single();

  if (!data) {
    await sb.from('futures_balances').upsert({
      user_id: userId, balance: INITIAL_FUTURES_BALANCE, margin_used: 0,
    });
    return { balance: INITIAL_FUTURES_BALANCE, margin_used: 0 };
  }
  return data;
}

export async function updateFuturesBalance(userId: string, balance: number, marginUsed: number) {
  const sb = createServerClient();
  if (!sb) return;

  await sb.from('futures_balances').upsert({
    user_id: userId, balance: Math.max(0, balance), margin_used: Math.max(0, marginUsed),
    updated_at: new Date().toISOString(),
  });
}

export async function getOpenPositions(userId: string): Promise<DBFuturesPosition[]> {
  const sb = createServerClient();
  if (!sb) return [];

  const { data } = await sb
    .from('futures_positions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'OPEN')
    .order('created_at', { ascending: false });

  return data || [];
}

export async function insertPosition(userId: string, pos: Omit<DBFuturesPosition, 'id' | 'created_at' | 'realized_pnl'>) {
  const sb = createServerClient();
  if (!sb) return null;

  const { data, error } = await sb
    .from('futures_positions')
    .insert({ ...pos, user_id: userId, realized_pnl: 0 })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function closePosition(positionId: string, realizedPnl: number) {
  const sb = createServerClient();
  if (!sb) return;

  await sb.from('futures_positions').update({
    status: 'CLOSED',
    realized_pnl: realizedPnl,
    closed_at: new Date().toISOString(),
  }).eq('id', positionId);
}

// ============ Exported Constants ============
export { INITIAL_SPOT_BALANCE, INITIAL_FUTURES_BALANCE, TRADE_FEE, FUTURES_FEE };
