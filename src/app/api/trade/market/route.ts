import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  getPortfolioBalance,
  upsertPortfolioAsset,
  insertOrder,
  TRADE_FEE,
} from '@/lib/db';

// Authenticate request via Supabase session
async function getUser(req: NextRequest) {
  const sb = createServerClient();
  if (!sb) return null;

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// Fetch current orderbook from Binance for fill simulation
async function fetchOrderbook(symbol: string): Promise<{ asks: [string, string][]; bids: [string, string][] }> {
  const res = await fetch(`https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=20`);
  if (!res.ok) throw new Error('Failed to fetch orderbook');
  return res.json();
}

export async function POST(req: NextRequest) {
  // === Auth ===
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // === Parse body ===
  const body = await req.json();
  const { symbol, side, quantity } = body as {
    symbol: string; side: 'BUY' | 'SELL'; quantity: number;
  };

  if (!symbol || !side || !quantity || quantity <= 0) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }

  try {
    // === Fetch live orderbook from Binance ===
    const ob = await fetchOrderbook(symbol);
    const levels = side === 'BUY'
      ? ob.asks.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) }))
      : ob.bids.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) }));

    if (levels.length === 0) {
      return NextResponse.json({ error: 'No liquidity available' }, { status: 400 });
    }

    // === Simulate fill ===
    let remaining = quantity;
    let totalCost = 0;
    for (const level of levels) {
      if (remaining <= 0) break;
      const fillQty = Math.min(remaining, level.quantity);
      totalCost += level.price * fillQty;
      remaining -= fillQty;
    }
    const filledQty = quantity - remaining;
    if (filledQty <= 0) {
      return NextResponse.json({ error: 'Insufficient liquidity' }, { status: 400 });
    }

    const avgPrice = totalCost / filledQty;
    const fee = totalCost * TRADE_FEE;
    const baseAsset = symbol.replace('USDT', '');

    // === Strict balance check ===
    if (side === 'BUY') {
      const usdtBalance = await getPortfolioBalance(user.id, 'USDT');
      const totalRequired = totalCost + fee;
      if (totalRequired > usdtBalance + 0.01) {
        return NextResponse.json({
          error: `Insufficient USDT: need ${totalRequired.toFixed(2)}, have ${usdtBalance.toFixed(2)}`,
        }, { status: 400 });
      }
      // Deduct USDT
      await upsertPortfolioAsset(user.id, 'USDT', usdtBalance - totalRequired, 1);
      // Add base asset
      const currentBase = await getPortfolioBalance(user.id, baseAsset);
      const sb = createServerClient();
      const { data: existingAsset } = await sb!.from('portfolios')
        .select('avg_price').eq('user_id', user.id).eq('asset', baseAsset).single();
      const oldAvg = existingAsset?.avg_price || 0;
      const newBalance = currentBase + filledQty;
      const newAvg = newBalance > 0 ? (currentBase * oldAvg + totalCost) / newBalance : avgPrice;
      await upsertPortfolioAsset(user.id, baseAsset, newBalance, newAvg);
    } else {
      const baseBalance = await getPortfolioBalance(user.id, baseAsset);
      if (filledQty > baseBalance + 0.00000001) {
        return NextResponse.json({
          error: `Insufficient ${baseAsset}: need ${filledQty.toFixed(8)}, have ${baseBalance.toFixed(8)}`,
        }, { status: 400 });
      }
      // Deduct base asset
      await upsertPortfolioAsset(user.id, baseAsset, baseBalance - filledQty, 0);
      // Add USDT
      const usdtBalance = await getPortfolioBalance(user.id, 'USDT');
      await upsertPortfolioAsset(user.id, 'USDT', usdtBalance + totalCost - fee, 1);
    }

    // === Record order ===
    const order = await insertOrder(user.id, {
      symbol, side, type: 'MARKET',
      price: avgPrice, quantity: filledQty,
      filled_quantity: filledQty, avg_fill_price: avgPrice,
      status: 'FILLED',
    });

    return NextResponse.json({
      success: true,
      order,
      avgPrice,
      filledQty,
      fee,
      slippage: levels.length > 0 ? Math.abs(avgPrice - levels[0].price) / levels[0].price * 100 : 0,
    });
  } catch (error) {
    console.error('Market order error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
