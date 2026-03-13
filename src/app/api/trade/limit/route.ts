import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  getPortfolioBalance,
  upsertPortfolioAsset,
  insertOrder,
  updateOrder,
  TRADE_FEE,
} from '@/lib/db';

async function getUser(req: NextRequest) {
  const sb = createServerClient();
  if (!sb) return null;
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await sb.auth.getUser(authHeader.slice(7));
  if (error || !user) return null;
  return user;
}

// POST: Place a limit order (with balance reservation)
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { symbol, side, price, quantity } = await req.json() as {
    symbol: string; side: 'BUY' | 'SELL'; price: number; quantity: number;
  };

  if (!symbol || !side || !price || !quantity || price <= 0 || quantity <= 0) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }

  try {
    const baseAsset = symbol.replace('USDT', '');

    // === Balance check & reservation ===
    if (side === 'BUY') {
      const totalRequired = price * quantity * (1 + TRADE_FEE);
      const usdtBalance = await getPortfolioBalance(user.id, 'USDT');
      if (totalRequired > usdtBalance + 0.01) {
        return NextResponse.json({
          error: `Insufficient USDT: need ${totalRequired.toFixed(2)}, have ${usdtBalance.toFixed(2)}`,
        }, { status: 400 });
      }
      // Lock USDT
      await upsertPortfolioAsset(user.id, 'USDT', usdtBalance - totalRequired, 1);
    } else {
      const baseBalance = await getPortfolioBalance(user.id, baseAsset);
      if (quantity > baseBalance + 0.00000001) {
        return NextResponse.json({
          error: `Insufficient ${baseAsset}: need ${quantity.toFixed(8)}, have ${baseBalance.toFixed(8)}`,
        }, { status: 400 });
      }
      // Lock base asset
      await upsertPortfolioAsset(user.id, baseAsset, baseBalance - quantity, 0);
    }

    // === Create order ===
    const order = await insertOrder(user.id, {
      symbol, side, type: 'LIMIT', price, quantity,
      filled_quantity: 0, avg_fill_price: 0, status: 'OPEN',
    });

    return NextResponse.json({ success: true, order });
  } catch (error) {
    console.error('Limit order error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Cancel a limit order (return reserved funds)
export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { orderId } = await req.json() as { orderId: string };
  if (!orderId) return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });

  try {
    const sb = createServerClient();
    if (!sb) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

    // Fetch the order
    const { data: order } = await sb.from('orders').select('*')
      .eq('id', orderId).eq('user_id', user.id).single();

    if (!order || order.status !== 'OPEN') {
      return NextResponse.json({ error: 'Order not found or not open' }, { status: 404 });
    }

    const baseAsset = order.symbol.replace('USDT', '');

    // Return reserved funds
    if (order.side === 'BUY') {
      const reserved = order.price * order.quantity * (1 + TRADE_FEE);
      const usdtBalance = await getPortfolioBalance(user.id, 'USDT');
      await upsertPortfolioAsset(user.id, 'USDT', usdtBalance + reserved, 1);
    } else {
      const baseBalance = await getPortfolioBalance(user.id, baseAsset);
      await upsertPortfolioAsset(user.id, baseAsset, baseBalance + order.quantity, 0);
    }

    // Cancel order
    await updateOrder(orderId, { status: 'CANCELLED' });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Cancel order error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
