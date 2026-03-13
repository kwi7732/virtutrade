import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  getPortfolioBalance,
  upsertPortfolioAsset,
  updateOrder,
  TRADE_FEE,
} from '@/lib/db';

// This endpoint checks all OPEN limit orders and fills them if price condition is met.
// Can be called by Vercel Cron, or manually.
// GET /api/cron/check-limits?secret=YOUR_CRON_SECRET

export async function GET(req: Request) {
  // Simple auth for cron
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET || 'dev-secret';
  if (secret !== cronSecret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = createServerClient();
  if (!sb) {
    return NextResponse.json({ message: 'DB not configured, skipping' });
  }

  try {
    // Get all open limit orders
    const { data: openOrders, error } = await sb
      .from('orders')
      .select('*')
      .eq('status', 'OPEN')
      .eq('type', 'LIMIT');

    if (error || !openOrders || openOrders.length === 0) {
      return NextResponse.json({ filled: 0, message: 'No open limit orders' });
    }

    // Group by symbol to minimize API calls
    const symbolGroups = new Map<string, typeof openOrders>();
    for (const order of openOrders) {
      const existing = symbolGroups.get(order.symbol) || [];
      existing.push(order);
      symbolGroups.set(order.symbol, existing);
    }

    let filledCount = 0;

    for (const [symbol, orders] of symbolGroups) {
      // Fetch current price from Binance
      const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
      if (!res.ok) continue;
      const { price: priceStr } = await res.json();
      const currentPrice = parseFloat(priceStr);
      if (!currentPrice) continue;

      for (const order of orders) {
        let shouldFill = false;

        if (order.side === 'BUY' && currentPrice <= order.price) shouldFill = true;
        if (order.side === 'SELL' && currentPrice >= order.price) shouldFill = true;

        if (shouldFill) {
          const baseAsset = order.symbol.replace('USDT', '');
          const totalCost = order.price * order.quantity;
          const fee = totalCost * TRADE_FEE;

          // Fill the order
          await updateOrder(order.id, {
            status: 'FILLED',
            filled_quantity: order.quantity,
            avg_fill_price: order.price,
          });

          // Deliver the counterpart
          if (order.side === 'BUY') {
            // USDT was already reserved. Deliver base asset.
            const currentBase = await getPortfolioBalance(order.user_id, baseAsset);
            const newBalance = currentBase + order.quantity;
            const avgPrice = newBalance > 0 ? (currentBase * 0 + totalCost) / newBalance : order.price;
            await upsertPortfolioAsset(order.user_id, baseAsset, newBalance, avgPrice);
          } else {
            // Base asset was already reserved. Deliver USDT.
            const usdtBalance = await getPortfolioBalance(order.user_id, 'USDT');
            await upsertPortfolioAsset(order.user_id, 'USDT', usdtBalance + totalCost - fee, 1);
          }

          filledCount++;
        }
      }
    }

    return NextResponse.json({
      filled: filledCount,
      checked: openOrders.length,
      symbols: Array.from(symbolGroups.keys()),
    });
  } catch (error) {
    console.error('Limit order check error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
