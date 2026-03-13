import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getPortfolio, getOrders, getOpenPositions, getFuturesBalance } from '@/lib/db';

async function getUser(req: NextRequest) {
  const sb = createServerClient();
  if (!sb) return null;
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await sb.auth.getUser(authHeader.slice(7));
  if (error || !user) return null;
  return user;
}

// GET: Load full user state (portfolio + orders + positions + futures balance)
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [portfolio, orders, positions, futuresBalance] = await Promise.all([
      getPortfolio(user.id),
      getOrders(user.id, 100),
      getOpenPositions(user.id),
      getFuturesBalance(user.id),
    ]);

    return NextResponse.json({
      portfolio: portfolio.map(p => ({
        asset: p.asset,
        balance: p.balance,
        avgPrice: p.avg_price,
      })),
      orders: orders.map(o => ({
        id: o.id,
        symbol: o.symbol,
        side: o.side,
        type: o.type,
        price: o.price,
        quantity: o.quantity,
        filledQuantity: o.filled_quantity,
        avgFillPrice: o.avg_fill_price,
        status: o.status,
        createdAt: new Date(o.created_at).getTime(),
      })),
      positions: positions.map(p => ({
        id: p.id,
        symbol: p.symbol,
        side: p.side,
        leverage: p.leverage,
        entryPrice: p.entry_price,
        quantity: p.quantity,
        margin: p.margin,
        liquidationPrice: p.liquidation_price,
        marginMode: p.margin_mode,
        unrealizedPnl: 0,
        createdAt: new Date(p.created_at).getTime(),
      })),
      futuresBalance: futuresBalance.balance,
      futuresMarginUsed: futuresBalance.margin_used,
    });
  } catch (error) {
    console.error('Portfolio load error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
