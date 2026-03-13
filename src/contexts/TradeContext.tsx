'use client';

import React, { createContext, useContext, useReducer, useCallback, ReactNode, useEffect, useRef } from 'react';
import { apiLoadUserState, apiMarketOrder, apiLimitOrder, apiCancelOrder, isSupabaseConfigured } from '@/lib/api';

// ============ Types ============
export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdateId: number;
}

export interface Ticker {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  quoteVolume24h: number;
}

export interface Kline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RecentTrade {
  id: string;
  price: number;
  quantity: number;
  time: number;
  isBuyerMaker: boolean;
}

export interface PortfolioAsset {
  asset: string;
  balance: number;
  avgPrice: number;
}

export interface Order {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  price: number;
  quantity: number;
  filledQuantity: number;
  avgFillPrice: number;
  status: 'OPEN' | 'FILLED' | 'CANCELLED';
  createdAt: number;
}

// ============ Futures Types ============
export type TradeMode = 'spot' | 'futures';
export type PositionSide = 'LONG' | 'SHORT';
export type MarginMode = 'cross' | 'isolated';

export interface FuturesPosition {
  id: string;
  symbol: string;
  side: PositionSide;
  leverage: number;
  entryPrice: number;
  quantity: number;
  margin: number;          // collateral locked
  liquidationPrice: number;
  unrealizedPnl: number;
  marginMode: MarginMode;
  createdAt: number;
}

export interface FuturesOrder {
  id: string;
  symbol: string;
  side: PositionSide;
  type: 'MARKET' | 'LIMIT';
  leverage: number;
  price: number;
  quantity: number;
  status: 'OPEN' | 'FILLED' | 'CANCELLED';
  createdAt: number;
}

// ============ State ============
export interface TradeState {
  symbol: string;
  ticker: Ticker | null;
  orderBook: OrderBook;
  recentTrades: RecentTrade[];
  klines: Kline[];
  portfolio: PortfolioAsset[];
  orders: Order[];
  loading: boolean;
  connected: boolean;
  interval: string;
  // Shared
  selectedPrice: number | null;  // Price clicked in OrderBook/RecentTrades → auto-fills TradeForm
  // Futures
  tradeMode: TradeMode;
  positions: FuturesPosition[];
  futuresOrders: FuturesOrder[];
  futuresBalance: number;     // USDT available for futures
  futuresMarginUsed: number;  // Total margin locked in positions
}

type TradeAction =
  | { type: 'SET_SYMBOL'; payload: string }
  | { type: 'SET_TICKER'; payload: Ticker }
  | { type: 'SET_ORDERBOOK'; payload: OrderBook }
  | { type: 'ADD_RECENT_TRADE'; payload: RecentTrade }
  | { type: 'SET_KLINES'; payload: Kline[] }
  | { type: 'UPDATE_KLINE'; payload: Kline }
  | { type: 'SET_PORTFOLIO'; payload: PortfolioAsset[] }
  | { type: 'UPDATE_PORTFOLIO_ASSET'; payload: PortfolioAsset }
  | { type: 'SET_ORDERS'; payload: Order[] }
  | { type: 'ADD_ORDER'; payload: Order }
  | { type: 'UPDATE_ORDER'; payload: Partial<Order> & { id: string } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_CONNECTED'; payload: boolean }
  | { type: 'SET_INTERVAL'; payload: string }
  | { type: 'INIT_RECENT_TRADES'; payload: RecentTrade[] }
  // Shared
  | { type: 'SET_SELECTED_PRICE'; payload: number | null }
  // Futures actions
  | { type: 'SET_TRADE_MODE'; payload: TradeMode }
  | { type: 'ADD_POSITION'; payload: FuturesPosition }
  | { type: 'UPDATE_POSITION'; payload: Partial<FuturesPosition> & { id: string } }
  | { type: 'REMOVE_POSITION'; payload: string }
  | { type: 'SET_FUTURES_BALANCE'; payload: number }
  | { type: 'ADD_FUTURES_ORDER'; payload: FuturesOrder }
  | { type: 'UPDATE_POSITIONS_PNL'; payload: number }; // currentPrice

const INITIAL_BALANCE = 70000;

const initialState: TradeState = {
  symbol: 'BTCUSDT',
  ticker: null,
  orderBook: { bids: [], asks: [], lastUpdateId: 0 },
  recentTrades: [],
  klines: [],
  portfolio: [
    { asset: 'USDT', balance: INITIAL_BALANCE, avgPrice: 1 },
  ],
  orders: [],
  loading: true,
  connected: false,
  interval: '1m',
  selectedPrice: null,
  // Futures
  tradeMode: 'spot',
  positions: [],
  futuresOrders: [],
  futuresBalance: INITIAL_BALANCE,
  futuresMarginUsed: 0,
};

// ============ Helpers ============
function calcLiquidationPrice(side: PositionSide, entryPrice: number, leverage: number): number {
  // Simplified liquidation: when margin (1/leverage of position) is consumed
  // LONG: liq = entry * (1 - 1/leverage + fee_buffer)
  // SHORT: liq = entry * (1 + 1/leverage - fee_buffer)
  const maintenanceRate = 0.005; // 0.5% maintenance margin
  if (side === 'LONG') {
    return entryPrice * (1 - (1 / leverage) + maintenanceRate);
  } else {
    return entryPrice * (1 + (1 / leverage) - maintenanceRate);
  }
}

function calcUnrealizedPnl(side: PositionSide, entryPrice: number, currentPrice: number, quantity: number): number {
  if (side === 'LONG') {
    return (currentPrice - entryPrice) * quantity;
  } else {
    return (entryPrice - currentPrice) * quantity;
  }
}

// ============ Reducer ============
function tradeReducer(state: TradeState, action: TradeAction): TradeState {
  switch (action.type) {
    case 'SET_SYMBOL':
      return { ...state, symbol: action.payload, klines: [], orderBook: { bids: [], asks: [], lastUpdateId: 0 }, recentTrades: [], ticker: null };
    case 'SET_TICKER':
      return { ...state, ticker: action.payload, loading: false };
    case 'SET_ORDERBOOK':
      return { ...state, orderBook: action.payload };
    case 'ADD_RECENT_TRADE':
      return { ...state, recentTrades: [action.payload, ...state.recentTrades].slice(0, 50) };
    case 'INIT_RECENT_TRADES':
      return { ...state, recentTrades: action.payload };
    case 'SET_KLINES':
      return { ...state, klines: action.payload };
    case 'UPDATE_KLINE': {
      const klines = [...state.klines];
      const last = klines[klines.length - 1];
      if (last && last.time === action.payload.time) {
        klines[klines.length - 1] = action.payload;
      } else {
        klines.push(action.payload);
      }
      return { ...state, klines };
    }
    case 'SET_PORTFOLIO':
      return { ...state, portfolio: action.payload };
    case 'UPDATE_PORTFOLIO_ASSET': {
      const portfolio = [...state.portfolio];
      const idx = portfolio.findIndex(a => a.asset === action.payload.asset);
      if (idx >= 0) {
        portfolio[idx] = action.payload;
      } else {
        portfolio.push(action.payload);
      }
      return { ...state, portfolio };
    }
    case 'SET_ORDERS':
      return { ...state, orders: action.payload };
    case 'ADD_ORDER':
      return { ...state, orders: [action.payload, ...state.orders] };
    case 'UPDATE_ORDER': {
      const orders = state.orders.map(o => o.id === action.payload.id ? { ...o, ...action.payload } : o);
      return { ...state, orders };
    }
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_CONNECTED':
      return { ...state, connected: action.payload };
    case 'SET_INTERVAL':
      return { ...state, interval: action.payload, klines: [] };
    case 'SET_SELECTED_PRICE':
      return { ...state, selectedPrice: action.payload };
    // Futures
    case 'SET_TRADE_MODE':
      return { ...state, tradeMode: action.payload };
    case 'ADD_POSITION':
      return {
        ...state,
        positions: [action.payload, ...state.positions],
        futuresMarginUsed: state.futuresMarginUsed + action.payload.margin,
      };
    case 'UPDATE_POSITION': {
      return {
        ...state,
        positions: state.positions.map(p => p.id === action.payload.id ? { ...p, ...action.payload } : p),
      };
    }
    case 'REMOVE_POSITION': {
      const pos = state.positions.find(p => p.id === action.payload);
      return {
        ...state,
        positions: state.positions.filter(p => p.id !== action.payload),
        futuresMarginUsed: state.futuresMarginUsed - (pos?.margin || 0),
      };
    }
    case 'SET_FUTURES_BALANCE':
      return { ...state, futuresBalance: action.payload };
    case 'ADD_FUTURES_ORDER':
      return { ...state, futuresOrders: [action.payload, ...state.futuresOrders] };
    case 'UPDATE_POSITIONS_PNL': {
      const currentPrice = action.payload;
      const updated = state.positions.map(p => ({
        ...p,
        unrealizedPnl: calcUnrealizedPnl(p.side, p.entryPrice, currentPrice, p.quantity),
      }));
      // Check liquidations
      const liquidated: FuturesPosition[] = [];
      const surviving: FuturesPosition[] = [];
      for (const p of updated) {
        const isLiquidated = p.side === 'LONG'
          ? currentPrice <= p.liquidationPrice
          : currentPrice >= p.liquidationPrice;
        if (isLiquidated) {
          liquidated.push(p);
        } else {
          surviving.push(p);
        }
      }
      let newBalance = state.futuresBalance;
      let newMarginUsed = state.futuresMarginUsed;
      for (const lp of liquidated) {
        // Lose entire margin on liquidation
        newMarginUsed -= lp.margin;
      }
      return {
        ...state,
        positions: surviving,
        futuresBalance: newBalance,
        futuresMarginUsed: Math.max(0, newMarginUsed),
      };
    }
    default:
      return state;
  }
}

// ============ Context ============
interface TradeContextType {
  state: TradeState;
  dispatch: React.Dispatch<TradeAction>;
  executeMarketOrder: (side: 'BUY' | 'SELL', quantity: number) => string | null;
  executeLimitOrder: (side: 'BUY' | 'SELL', price: number, quantity: number) => string | null;
  cancelOrder: (orderId: string) => void;
  setSymbol: (symbol: string) => void;
  setInterval: (interval: string) => void;
  setTradeMode: (mode: TradeMode) => void;
  setSelectedPrice: (price: number) => void;
  openFuturesPosition: (side: PositionSide, quantity: number, leverage: number) => void;
  closeFuturesPosition: (positionId: string) => void;
}

const TradeContext = createContext<TradeContextType | null>(null);

export function TradeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(tradeReducer, initialState);
  const wsRef = useRef<WebSocket | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const dataLoadedRef = useRef(false);

  // Orderbook depletion map: tracks consumed qty per price level
  // Key format: "asks:83000" or "bids:82990"
  const depletionMapRef = useRef<Map<string, number>>(new Map());

  // ========== Load user data from Supabase on mount ==========
  useEffect(() => {
    if (!isSupabaseConfigured || dataLoadedRef.current) return;
    dataLoadedRef.current = true;

    apiLoadUserState().then(data => {
      if (!data) return; // Demo mode
      if (data.portfolio) dispatch({ type: 'SET_PORTFOLIO', payload: data.portfolio });
      if (data.orders) dispatch({ type: 'SET_ORDERS', payload: data.orders });
      if (data.positions) {
        for (const pos of data.positions) {
          dispatch({ type: 'ADD_POSITION', payload: pos });
        }
      }
      if (data.futuresBalance !== undefined) {
        dispatch({ type: 'SET_FUTURES_BALANCE', payload: data.futuresBalance });
      }
    }).catch(err => console.warn('Failed to load user data:', err));
  }, []);

  // ========== Binance WebSocket ==========
  useEffect(() => {
    const symbol = state.symbol.toLowerCase();
    const interval = state.interval;

    // Fetch initial klines
    fetch(`https://api.binance.com/api/v3/klines?symbol=${state.symbol}&interval=${interval}&limit=500`)
      .then(res => res.json())
      .then(data => {
        const klines: Kline[] = data.map((k: number[]) => ({
          time: k[0] / 1000,
          open: parseFloat(String(k[1])),
          high: parseFloat(String(k[2])),
          low: parseFloat(String(k[3])),
          close: parseFloat(String(k[4])),
          volume: parseFloat(String(k[5])),
        }));
        dispatch({ type: 'SET_KLINES', payload: klines });
      })
      .catch(console.error);

    // Fetch initial recent trades
    fetch(`https://api.binance.com/api/v3/trades?symbol=${state.symbol}&limit=50`)
      .then(res => res.json())
      .then(data => {
        const trades: RecentTrade[] = data.map((t: { id: number; price: string; qty: string; time: number; isBuyerMaker: boolean }) => ({
          id: String(t.id),
          price: parseFloat(t.price),
          quantity: parseFloat(t.qty),
          time: t.time,
          isBuyerMaker: t.isBuyerMaker,
        })).reverse();
        dispatch({ type: 'INIT_RECENT_TRADES', payload: trades });
      })
      .catch(console.error);

    // WebSocket streams: ticker + kline + depth + trade
    const streams = `${symbol}@ticker/${symbol}@kline_${interval}/${symbol}@depth20@100ms/${symbol}@trade`;
    let ws: WebSocket | null = null;
    let cancelled = false;

    // Trade batching: aggregate same-price trades within 200ms window
    let tradeBatchTimer: ReturnType<typeof setTimeout> | null = null;
    let tradeBatch: { price: number; quantity: number; time: number; isBuyerMaker: boolean } | null = null;
    let tradeBatchId = 0;

    const flushTradeBatch = () => {
      if (tradeBatch && !cancelled) {
        dispatch({
          type: 'ADD_RECENT_TRADE',
          payload: {
            id: `batch-${tradeBatchId++}`,
            price: tradeBatch.price,
            quantity: tradeBatch.quantity,
            time: tradeBatch.time,
            isBuyerMaker: tradeBatch.isBuyerMaker,
          },
        });
        tradeBatch = null;
      }
    };

    // Debounce WebSocket connection to avoid StrictMode double-fire
    const connectTimer = setTimeout(() => {
      if (cancelled) return;
      ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) dispatch({ type: 'SET_CONNECTED', payload: true });
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        const msg = JSON.parse(event.data);
        const stream = msg.stream as string;
        const data = msg.data;

        if (stream.includes('@ticker')) {
          const currentPrice = parseFloat(data.c);
          dispatch({
            type: 'SET_TICKER',
            payload: {
              symbol: data.s,
              price: currentPrice,
              priceChange: parseFloat(data.p),
              priceChangePercent: parseFloat(data.P),
              high24h: parseFloat(data.h),
              low24h: parseFloat(data.l),
              volume24h: parseFloat(data.v),
              quoteVolume24h: parseFloat(data.q),
            },
          });
          if (stateRef.current.positions.length > 0) {
            dispatch({ type: 'UPDATE_POSITIONS_PNL', payload: currentPrice });
          }
        } else if (stream.includes('@kline')) {
          const k = data.k;
          dispatch({
            type: 'UPDATE_KLINE',
            payload: {
              time: k.t / 1000,
              open: parseFloat(k.o),
              high: parseFloat(k.h),
              low: parseFloat(k.l),
              close: parseFloat(k.c),
              volume: parseFloat(k.v),
            },
          });
        } else if (stream.includes('@depth')) {
          const rawBids = data.bids.map((b: string[]) => ({ price: parseFloat(b[0]), quantity: parseFloat(b[1]) }));
          const rawAsks = data.asks.map((a: string[]) => ({ price: parseFloat(a[0]), quantity: parseFloat(a[1]) }));

          // Apply depletion overlay and decay
          const dm = depletionMapRef.current;
          const applyDepletion = (levels: OrderBookLevel[], side: string) =>
            levels.map(l => {
              const key = `${side}:${l.price}`;
              const dep = dm.get(key) || 0;
              if (dep > 0) return { ...l, quantity: Math.max(0, l.quantity - dep) };
              return l;
            }).filter(l => l.quantity > 0.00000001);

          // Decay all depletions by 30% per update (~100ms)
          for (const [key, val] of dm.entries()) {
            const decayed = val * 0.7;
            if (decayed < 0.00001) dm.delete(key);
            else dm.set(key, decayed);
          }

          dispatch({
            type: 'SET_ORDERBOOK',
            payload: {
              bids: applyDepletion(rawBids, 'bids'),
              asks: applyDepletion(rawAsks, 'asks'),
              lastUpdateId: data.lastUpdateId,
            },
          });
        } else if (stream.includes('@trade')) {
          const tradePrice = parseFloat(data.p);
          const tradeQty = parseFloat(data.q);
          const tradeTime = data.T;
          const isBuyerMaker = data.m;

          // Real-time chart update: update last candle with every trade
          const klines = stateRef.current.klines;
          if (klines.length > 0) {
            const last = klines[klines.length - 1];
            dispatch({
              type: 'UPDATE_KLINE',
              payload: {
                ...last,
                close: tradePrice,
                high: Math.max(last.high, tradePrice),
                low: Math.min(last.low, tradePrice),
              },
            });
          }

          // If same price as current batch, aggregate
          if (tradeBatch && tradeBatch.price === tradePrice && tradeBatch.isBuyerMaker === isBuyerMaker) {
            tradeBatch.quantity += tradeQty;
            tradeBatch.time = tradeTime;
          } else {
            // Flush previous batch if different price
            flushTradeBatch();
            tradeBatch = { price: tradePrice, quantity: tradeQty, time: tradeTime, isBuyerMaker };
          }

          // Reset timer — flush after 200ms of no new same-price trades
          if (tradeBatchTimer) clearTimeout(tradeBatchTimer);
          tradeBatchTimer = setTimeout(flushTradeBatch, 200);
        }
      };

      ws.onclose = () => {
        if (!cancelled) dispatch({ type: 'SET_CONNECTED', payload: false });
      };

      ws.onerror = () => {
        if (!cancelled) dispatch({ type: 'SET_CONNECTED', payload: false });
      };
    }, 100);

    return () => {
      cancelled = true;
      clearTimeout(connectTimer);
      if (tradeBatchTimer) clearTimeout(tradeBatchTimer);
      if (ws) ws.close();
    };
  }, [state.symbol, state.interval]);

  // ========== Helper: get balance for an asset ==========
  const getBalance = useCallback((asset: string): number => {
    const p = stateRef.current.portfolio.find(a => a.asset === asset);
    return p ? p.balance : 0;
  }, []);

  // ========== Helper: apply portfolio changes ==========
  const applyPortfolioChanges = useCallback((
    changes: { asset: string; delta: number; avgPriceInfo?: { cost: number; qty: number } }[]
  ) => {
    const s = stateRef.current;
    const portfolio = [...s.portfolio];

    for (const change of changes) {
      const idx = portfolio.findIndex(a => a.asset === change.asset);
      if (idx >= 0) {
        const newBalance = Math.max(0, portfolio[idx].balance + change.delta);
        let newAvgPrice = portfolio[idx].avgPrice;
        // Update avg price only when ADDING to position
        if (change.avgPriceInfo && change.delta > 0) {
          const existing = portfolio[idx];
          newAvgPrice = (existing.balance * existing.avgPrice + change.avgPriceInfo.cost) / newBalance;
        }
        portfolio[idx] = { ...portfolio[idx], balance: newBalance, avgPrice: newAvgPrice };
      } else if (change.delta > 0) {
        portfolio.push({
          asset: change.asset,
          balance: change.delta,
          avgPrice: change.avgPriceInfo ? change.avgPriceInfo.cost / change.avgPriceInfo.qty : 0,
        });
      }
    }

    dispatch({ type: 'SET_PORTFOLIO', payload: portfolio.filter(a => a.balance > 0.00000001) });
  }, []);

  // ========== Spot: Market Order (strict validation) ==========
  const executeMarketOrder = useCallback((side: 'BUY' | 'SELL', quantity: number): string | null => {
    const s = stateRef.current;
    const ob = s.orderBook;
    const levels = side === 'BUY' ? ob.asks : ob.bids;
    if (levels.length === 0) return 'No liquidity available';

    const baseAsset = s.symbol.replace('USDT', '');
    const quoteAsset = 'USDT';

    // ---- Pre-flight: simulate fill to know exact cost ----
    let remaining = quantity;
    let totalCost = 0;
    const consumedLevels: { price: number; qty: number }[] = [];
    for (const level of levels) {
      if (remaining <= 0) break;
      const fillQty = Math.min(remaining, level.quantity);
      totalCost += level.price * fillQty;
      remaining -= fillQty;
      consumedLevels.push({ price: level.price, qty: fillQty });
    }
    const filledQty = quantity - remaining;
    if (filledQty <= 0) return 'Insufficient liquidity';

    const avgPrice = totalCost / filledQty;
    const fee = totalCost * 0.001; // 0.1% fee

    // ---- Strict balance check ----
    if (side === 'BUY') {
      const usdtBalance = getBalance(quoteAsset);
      const totalRequired = totalCost + fee;
      if (totalRequired > usdtBalance + 0.01) { // 0.01 tolerance for floating point
        return `Insufficient USDT: need ${totalRequired.toFixed(2)}, have ${usdtBalance.toFixed(2)}`;
      }
    } else {
      const baseBalance = getBalance(baseAsset);
      if (filledQty > baseBalance + 0.00000001) {
        return `Insufficient ${baseAsset}: need ${filledQty.toFixed(8)}, have ${baseBalance.toFixed(8)}`;
      }
    }

    // ---- Execute: record order ----
    const order: Order = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      symbol: s.symbol, side, type: 'MARKET',
      price: avgPrice, quantity: filledQty, filledQuantity: filledQty,
      avgFillPrice: avgPrice, status: 'FILLED', createdAt: Date.now(),
    };
    dispatch({ type: 'ADD_ORDER', payload: order });

    // ---- Register orderbook depletion ----
    const depSide = side === 'BUY' ? 'asks' : 'bids';
    for (const cl of consumedLevels) {
      const key = `${depSide}:${cl.price}`;
      depletionMapRef.current.set(key, (depletionMapRef.current.get(key) || 0) + cl.qty);
    }

    // ---- Execute: update portfolio ----
    if (side === 'BUY') {
      applyPortfolioChanges([
        { asset: quoteAsset, delta: -(totalCost + fee) },
        { asset: baseAsset, delta: filledQty, avgPriceInfo: { cost: totalCost, qty: filledQty } },
      ]);
    } else {
      applyPortfolioChanges([
        { asset: baseAsset, delta: -filledQty },
        { asset: quoteAsset, delta: totalCost - fee },
      ]);
    }
    // ---- Sync to DB (fire-and-forget) ----
    if (isSupabaseConfigured) {
      apiMarketOrder(s.symbol, side, quantity).catch(err => console.warn('DB sync failed:', err));
    }

    return null; // success
  }, [getBalance, applyPortfolioChanges]);

  // ========== Spot: Limit Order (with balance reservation) ==========
  const executeLimitOrder = useCallback((side: 'BUY' | 'SELL', price: number, quantity: number): string | null => {
    const s = stateRef.current;
    const baseAsset = s.symbol.replace('USDT', '');
    const quoteAsset = 'USDT';

    // ---- Strict balance check & reservation ----
    if (side === 'BUY') {
      const totalRequired = price * quantity * 1.001; // include fee
      const usdtBalance = getBalance(quoteAsset);
      if (totalRequired > usdtBalance + 0.01) {
        return `Insufficient USDT: need ${totalRequired.toFixed(2)}, have ${usdtBalance.toFixed(2)}`;
      }
      // Reserve (lock) the USDT
      applyPortfolioChanges([{ asset: quoteAsset, delta: -totalRequired }]);
    } else {
      const baseBalance = getBalance(baseAsset);
      if (quantity > baseBalance + 0.00000001) {
        return `Insufficient ${baseAsset}: need ${quantity.toFixed(8)}, have ${baseBalance.toFixed(8)}`;
      }
      // Reserve (lock) the base asset
      applyPortfolioChanges([{ asset: baseAsset, delta: -quantity }]);
    }

    const order: Order = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      symbol: s.symbol, side, type: 'LIMIT', price, quantity,
      filledQuantity: 0, avgFillPrice: 0, status: 'OPEN', createdAt: Date.now(),
    };
    dispatch({ type: 'ADD_ORDER', payload: order });

    // ---- Sync to DB (fire-and-forget) ----
    if (isSupabaseConfigured) {
      apiLimitOrder(s.symbol, side, price, quantity).catch(err => console.warn('DB sync failed:', err));
    }

    return null; // success
  }, [getBalance, applyPortfolioChanges]);

  // ========== Limit Order Auto-Fill (checked on every ticker update) ==========
  const checkLimitOrderFills = useCallback((currentPrice: number) => {
    const s = stateRef.current;
    const openLimitOrders = s.orders.filter(
      o => o.status === 'OPEN' && o.type === 'LIMIT' && o.symbol === s.symbol
    );

    for (const order of openLimitOrders) {
      let shouldFill = false;

      // BUY limit: fills when market price drops to or below limit price
      if (order.side === 'BUY' && currentPrice <= order.price) {
        shouldFill = true;
      }
      // SELL limit: fills when market price rises to or above limit price
      if (order.side === 'SELL' && currentPrice >= order.price) {
        shouldFill = true;
      }

      if (shouldFill) {
        const baseAsset = order.symbol.replace('USDT', '');
        const quoteAsset = 'USDT';
        const totalCost = order.price * order.quantity;
        const fee = totalCost * 0.001;

        // Fill the order
        dispatch({
          type: 'UPDATE_ORDER',
          payload: {
            id: order.id,
            status: 'FILLED',
            filledQuantity: order.quantity,
            avgFillPrice: order.price,
          },
        });

        // Unlock reserved funds → deliver the other side
        if (order.side === 'BUY') {
          // USDT was already reserved. Now deliver the base asset.
          // Reserved amount was price * qty * 1.001. Fee was included in reservation.
          // Deliver base asset to portfolio
          applyPortfolioChanges([
            { asset: baseAsset, delta: order.quantity, avgPriceInfo: { cost: totalCost, qty: order.quantity } },
          ]);
        } else {
          // Base asset was already reserved. Now deliver USDT.
          applyPortfolioChanges([
            { asset: quoteAsset, delta: totalCost - fee },
          ]);
        }
      }
    }
  }, [applyPortfolioChanges]);

  // ========== Cancel Order (return reserved funds) ==========
  const cancelOrder = useCallback((orderId: string) => {
    const s = stateRef.current;
    const order = s.orders.find(o => o.id === orderId);

    if (order && order.status === 'OPEN' && order.type === 'LIMIT') {
      const baseAsset = order.symbol.replace('USDT', '');
      const quoteAsset = 'USDT';

      // Return reserved funds
      if (order.side === 'BUY') {
        const reserved = order.price * order.quantity * 1.001;
        applyPortfolioChanges([{ asset: quoteAsset, delta: reserved }]);
      } else {
        applyPortfolioChanges([{ asset: baseAsset, delta: order.quantity }]);
      }
    }

    dispatch({ type: 'UPDATE_ORDER', payload: { id: orderId, status: 'CANCELLED' } });

    // ---- Sync to DB (fire-and-forget) ----
    if (isSupabaseConfigured) {
      apiCancelOrder(orderId).catch(err => console.warn('DB sync failed:', err));
    }
  }, [applyPortfolioChanges]);

  // ========== Auto-fill limit orders on price change ==========
  useEffect(() => {
    if (state.ticker?.price) {
      checkLimitOrderFills(state.ticker.price);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ticker?.price]);

  // ========== Futures Trading Logic ==========
  const openFuturesPosition = useCallback((side: PositionSide, quantity: number, leverage: number) => {
    const s = stateRef.current;
    if (!s.ticker) return;

    const ob = s.orderBook;
    const levels = side === 'LONG' ? ob.asks : ob.bids;
    if (levels.length === 0) return;

    // Calculate fill price with slippage
    let remaining = quantity;
    let totalCost = 0;
    for (const level of levels) {
      if (remaining <= 0) break;
      const fillQty = Math.min(remaining, level.quantity);
      totalCost += level.price * fillQty;
      remaining -= fillQty;
    }
    const filledQty = quantity - remaining;
    if (filledQty <= 0) return;

    const entryPrice = totalCost / filledQty;
    const notionalValue = entryPrice * filledQty;
    const margin = notionalValue / leverage;
    const fee = notionalValue * 0.0004; // 0.04% taker fee for futures

    // Check available balance
    const availableBalance = s.futuresBalance - s.futuresMarginUsed;
    if (margin + fee > availableBalance) return;

    const liquidationPrice = calcLiquidationPrice(side, entryPrice, leverage);

    const position: FuturesPosition = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      symbol: s.symbol,
      side,
      leverage,
      entryPrice,
      quantity: filledQty,
      margin,
      liquidationPrice,
      unrealizedPnl: 0,
      marginMode: 'isolated',
      createdAt: Date.now(),
    };

    dispatch({ type: 'ADD_POSITION', payload: position });
    dispatch({ type: 'SET_FUTURES_BALANCE', payload: s.futuresBalance - fee });
    dispatch({
      type: 'ADD_FUTURES_ORDER',
      payload: {
        id: position.id,
        symbol: s.symbol, side, type: 'MARKET', leverage,
        price: entryPrice, quantity: filledQty, status: 'FILLED',
        createdAt: Date.now(),
      },
    });
  }, []);

  const closeFuturesPosition = useCallback((positionId: string) => {
    const s = stateRef.current;
    const pos = s.positions.find(p => p.id === positionId);
    if (!pos || !s.ticker) return;

    const currentPrice = s.ticker.price;
    const pnl = calcUnrealizedPnl(pos.side, pos.entryPrice, currentPrice, pos.quantity);
    const notionalValue = currentPrice * pos.quantity;
    const fee = notionalValue * 0.0004;

    // Return margin + PnL to balance
    const returnAmount = pos.margin + pnl - fee;
    dispatch({ type: 'SET_FUTURES_BALANCE', payload: s.futuresBalance + returnAmount });
    dispatch({ type: 'REMOVE_POSITION', payload: positionId });
  }, []);

  const setSymbol = useCallback((symbol: string) => {
    dispatch({ type: 'SET_SYMBOL', payload: symbol });
  }, []);

  const setIntervalFn = useCallback((interval: string) => {
    dispatch({ type: 'SET_INTERVAL', payload: interval });
  }, []);

  const setTradeMode = useCallback((mode: TradeMode) => {
    dispatch({ type: 'SET_TRADE_MODE', payload: mode });
  }, []);

  const setSelectedPrice = useCallback((price: number) => {
    dispatch({ type: 'SET_SELECTED_PRICE', payload: price });
  }, []);

  return (
    <TradeContext.Provider value={{
      state, dispatch,
      executeMarketOrder, executeLimitOrder, cancelOrder,
      setSymbol, setInterval: setIntervalFn,
      setTradeMode, setSelectedPrice, openFuturesPosition, closeFuturesPosition,
    }}>
      {children}
    </TradeContext.Provider>
  );
}

export function useTrade() {
  const context = useContext(TradeContext);
  if (!context) throw new Error('useTrade must be used within TradeProvider');
  return context;
}
