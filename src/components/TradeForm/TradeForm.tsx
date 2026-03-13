'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTrade } from '@/contexts/TradeContext';
import { useI18n } from '@/contexts/I18nContext';
import styles from './TradeForm.module.css';

export default function TradeForm() {
  const { state, executeMarketOrder, executeLimitOrder, dispatch } = useTrade();
  const { t, formatPrice, formatNumber } = useI18n();
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('LIMIT');
  const [priceInput, setPriceInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [percentage, setPercentage] = useState(0);
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const baseAsset = state.symbol.replace('USDT', '');
  const quoteAsset = 'USDT';
  const currentPrice = state.ticker?.price || 0;

  // ---- Auto-fill price from OrderBook/RecentTrades click (Binance-style) ----
  useEffect(() => {
    if (state.selectedPrice !== null) {
      setPriceInput(state.selectedPrice.toString());
      setOrderType('LIMIT');
      dispatch({ type: 'SET_SELECTED_PRICE', payload: null });
    }
  }, [state.selectedPrice, dispatch]);

  // ---- Auto-fill current price on initial load for limit orders ----
  useEffect(() => {
    if (!priceInput && currentPrice > 0 && orderType === 'LIMIT') {
      setPriceInput(currentPrice.toString());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice > 0]);

  const availableBalance = useMemo(() => {
    if (side === 'BUY') {
      const asset = state.portfolio.find(a => a.asset === quoteAsset);
      return asset?.balance || 0;
    } else {
      const asset = state.portfolio.find(a => a.asset === baseAsset);
      return asset?.balance || 0;
    }
  }, [state.portfolio, side, baseAsset, quoteAsset]);

  const estimatedSlippage = useMemo(() => {
    if (!amountInput || !currentPrice || state.orderBook.asks.length === 0) return 0;
    const qty = parseFloat(amountInput);
    if (isNaN(qty) || qty <= 0) return 0;

    const levels = side === 'BUY' ? state.orderBook.asks : state.orderBook.bids;
    let remaining = qty;
    let totalCost = 0;
    for (const level of levels) {
      if (remaining <= 0) break;
      const fillQty = Math.min(remaining, level.quantity);
      totalCost += level.price * fillQty;
      remaining -= fillQty;
    }
    const filledQty = qty - remaining;
    if (filledQty <= 0) return 0;
    const avgPrice = totalCost / filledQty;
    return Math.abs(avgPrice - currentPrice) / currentPrice * 100;
  }, [amountInput, currentPrice, state.orderBook, side]);

  const handlePercentage = useCallback((pct: number) => {
    setPercentage(pct);
    if (currentPrice <= 0) return;
    if (side === 'BUY') {
      const maxQty = (availableBalance * pct / 100) / currentPrice;
      setAmountInput(maxQty.toFixed(6));
    } else {
      const qty = availableBalance * pct / 100;
      setAmountInput(qty.toFixed(6));
    }
  }, [availableBalance, currentPrice, side]);

  const totalValue = useMemo(() => {
    const qty = parseFloat(amountInput) || 0;
    const price = orderType === 'LIMIT' ? (parseFloat(priceInput) || 0) : currentPrice;
    return qty * price;
  }, [amountInput, priceInput, orderType, currentPrice]);

  const handleSubmit = () => {
    const qty = parseFloat(amountInput);
    if (isNaN(qty) || qty <= 0) return;

    if (orderType === 'MARKET') {
      if (side === 'BUY' && totalValue > availableBalance) {
        toast(t('trade.insufficientBalance'), 'error');
        return;
      }
      if (side === 'SELL' && qty > availableBalance) {
        toast(t('trade.insufficientBalance'), 'error');
        return;
      }
      const error = executeMarketOrder(side, qty);
      if (error) {
        toast(error, 'error');
        return;
      }
      toast(t('trade.orderSuccess'), 'success');
    } else {
      const price = parseFloat(priceInput);
      if (isNaN(price) || price <= 0) return;
      const error = executeLimitOrder(side, price, qty);
      if (error) {
        toast(error, 'error');
        return;
      }
      toast(t('trade.orderSuccess'), 'success');
    }
    setAmountInput('');
    setPriceInput('');
    setPercentage(0);
  };

  const toast = (message: string, type: 'success' | 'error') => {
    setShowToast({ message, type });
    setTimeout(() => setShowToast(null), 3000);
  };

  return (
    <div className={`${styles.container} trade-form-area`} id="trade-form">
      {/* Side tabs */}
      <div className={styles.sideTabs}>
        <button
          className={`${styles.sideTab} ${side === 'BUY' ? styles.buyActive : ''}`}
          onClick={() => setSide('BUY')}
          id="tab-buy"
        >
          {t('trade.buy')}
        </button>
        <button
          className={`${styles.sideTab} ${side === 'SELL' ? styles.sellActive : ''}`}
          onClick={() => setSide('SELL')}
          id="tab-sell"
        >
          {t('trade.sell')}
        </button>
      </div>

      {/* Order type tabs */}
      <div className={styles.typeTabs}>
        <button
          className={`${styles.typeTab} ${orderType === 'LIMIT' ? styles.typeActive : ''}`}
          onClick={() => {
            setOrderType('LIMIT');
            if (!priceInput && currentPrice > 0) setPriceInput(currentPrice.toString());
          }}
        >
          {t('trade.limit')}
        </button>
        <button
          className={`${styles.typeTab} ${orderType === 'MARKET' ? styles.typeActive : ''}`}
          onClick={() => setOrderType('MARKET')}
        >
          {t('trade.market')}
        </button>
      </div>

      <div className={styles.form}>
        {/* Available balance */}
        <div className={styles.balance}>
          <span className={styles.balanceLabel}>{t('trade.available')}</span>
          <span className={styles.balanceValue}>
            {side === 'BUY'
              ? `${formatNumber(availableBalance, 2)} ${quoteAsset}`
              : `${formatNumber(availableBalance, 6)} ${baseAsset}`
            }
          </span>
        </div>

        {/* Price input (for limit) */}
        {orderType === 'LIMIT' && (
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>{t('trade.price')}</label>
            <div className={styles.inputWrapper}>
              <input
                type="number"
                className={`input-field ${styles.input}`}
                placeholder={t('trade.price')}
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                id="input-price"
              />
              <span className={styles.inputSuffix}>USDT</span>
            </div>
          </div>
        )}

        {/* Amount input */}
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>{t('trade.amount')}</label>
          <div className={styles.inputWrapper}>
            <input
              type="number"
              className={`input-field ${styles.input}`}
              placeholder={t('trade.amount')}
              value={amountInput}
              onChange={(e) => { setAmountInput(e.target.value); setPercentage(0); }}
              id="input-amount"
            />
            <span className={styles.inputSuffix}>{baseAsset}</span>
          </div>
        </div>

        {/* Percentage slider */}
        <div className={styles.percentBtns}>
          {[25, 50, 75, 100].map(pct => (
            <button
              key={pct}
              className={`${styles.pctBtn} ${percentage === pct ? styles.pctActive : ''}`}
              onClick={() => handlePercentage(pct)}
            >
              {pct}%
            </button>
          ))}
        </div>

        {/* Total */}
        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>{t('trade.total')}</span>
          <span className={styles.totalValue}>
            {formatNumber(totalValue, 2)} USDT
          </span>
        </div>

        {/* Slippage estimate */}
        {orderType === 'MARKET' && estimatedSlippage > 0.01 && (
          <div className={styles.slippageRow}>
            <span className={styles.slippageLabel}>{t('trade.slippage')}</span>
            <span className={`${styles.slippageValue} ${estimatedSlippage > 1 ? 'text-red' : 'text-accent'}`}>
              ~{estimatedSlippage.toFixed(3)}%
            </span>
          </div>
        )}

        {/* Fee note */}
        <div className={styles.feeRow}>
          <span>{t('trade.fee')}</span>
          <span>0.1%</span>
        </div>

        {/* Submit */}
        <button
          className={side === 'BUY' ? 'btn-buy' : 'btn-sell'}
          onClick={handleSubmit}
          id="btn-submit-order"
        >
          {orderType === 'MARKET'
            ? (side === 'BUY' ? t('trade.marketBuy') : t('trade.marketSell'))
            : (side === 'BUY' ? t('trade.limitBuy') : t('trade.limitSell'))
          } {baseAsset}
        </button>
      </div>

      {/* Toast */}
      {showToast && (
        <div className="toast-container">
          <div className={`toast ${showToast.type}`}>
            {showToast.message}
          </div>
        </div>
      )}
    </div>
  );
}
