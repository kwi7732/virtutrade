'use client';

import { useMemo } from 'react';
import { useTrade } from '@/contexts/TradeContext';
import { useI18n } from '@/contexts/I18nContext';
import styles from './OrderBook.module.css';

export default function OrderBook() {
  const { state, setSelectedPrice } = useTrade();
  const { t, formatPrice } = useI18n();
  const { orderBook, ticker } = state;

  const { asks, bids, maxQty } = useMemo(() => {
    const visibleAsks = [...orderBook.asks].slice(0, 15).reverse();
    const visibleBids = orderBook.bids.slice(0, 15);
    const allQtys = [...visibleAsks, ...visibleBids].map(l => l.quantity);
    const maxQ = Math.max(...allQtys, 0.001);
    return { asks: visibleAsks, bids: visibleBids, maxQty: maxQ };
  }, [orderBook]);

  // Cumulative totals for depth visualization (Binance-style)
  const askCumulatives = useMemo(() => {
    const reversed = [...asks].reverse(); // back to price-ascending
    let cumulative = 0;
    const cums = reversed.map(l => { cumulative += l.quantity; return cumulative; });
    return cums.reverse(); // match display order
  }, [asks]);

  const bidCumulatives = useMemo(() => {
    let cumulative = 0;
    return bids.map(l => { cumulative += l.quantity; return cumulative; });
  }, [bids]);

  const maxCumulative = useMemo(() => {
    const maxAsk = askCumulatives.length > 0 ? askCumulatives[0] : 0;
    const maxBid = bidCumulatives.length > 0 ? bidCumulatives[bidCumulatives.length - 1] : 0;
    return Math.max(maxAsk, maxBid, 0.001);
  }, [askCumulatives, bidCumulatives]);

  const formatQty = (qty: number) => {
    if (qty >= 1) return qty.toFixed(4);
    if (qty >= 0.01) return qty.toFixed(5);
    return qty.toFixed(6);
  };

  const handlePriceClick = (price: number) => {
    setSelectedPrice(price);
  };

  // Price direction arrow
  const priceDirection = ticker
    ? (ticker.priceChange >= 0 ? '▲' : '▼')
    : '';

  return (
    <div className={`${styles.container} orderbook-area`} id="orderbook">
      <div className={styles.header}>
        <span>{t('trade.orderBook')}</span>
      </div>

      <div className={styles.columnHeaders}>
        <span>{t('trade.price')}</span>
        <span>{t('trade.quantity')}</span>
        <span>{t('trade.total')}</span>
      </div>

      <div className={styles.asksSection}>
        {asks.map((level, i) => {
          const depthWidth = (askCumulatives[i] / maxCumulative) * 100;
          return (
            <div
              key={`ask-${i}`}
              className={styles.row}
              onClick={() => handlePriceClick(level.price)}
              title={`Cumulative: ${formatQty(askCumulatives[i])}`}
            >
              <div
                className={styles.depthBar}
                style={{ width: `${depthWidth}%`, background: 'rgba(246, 70, 93, 0.08)' }}
              />
              <div
                className={styles.volumeBar}
                style={{ width: `${(level.quantity / maxQty) * 100}%`, background: 'rgba(246, 70, 93, 0.15)' }}
              />
              <span className={`${styles.price} text-red`}>{formatPrice(level.price)}</span>
              <span className={styles.qty}>{formatQty(level.quantity)}</span>
              <span className={styles.total}>{formatQty(level.price * level.quantity)}</span>
            </div>
          );
        })}
      </div>

      <div className={styles.midPrice} onClick={() => ticker && handlePriceClick(ticker.price)}>
        {ticker && (
          <>
            <span className={`${styles.midPriceValue} ${ticker.priceChangePercent >= 0 ? 'text-green' : 'text-red'}`}>
              {formatPrice(ticker.price)}
            </span>
            <span className={`${styles.midPriceArrow} ${ticker.priceChange >= 0 ? 'text-green' : 'text-red'}`}>
              {priceDirection}
            </span>
            <span className={styles.midPriceUsd}>
              ≈ ${ticker.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </>
        )}
      </div>

      <div className={styles.bidsSection}>
        {bids.map((level, i) => {
          const depthWidth = (bidCumulatives[i] / maxCumulative) * 100;
          return (
            <div
              key={`bid-${i}`}
              className={styles.row}
              onClick={() => handlePriceClick(level.price)}
              title={`Cumulative: ${formatQty(bidCumulatives[i])}`}
            >
              <div
                className={styles.depthBar}
                style={{ width: `${depthWidth}%`, background: 'rgba(14, 203, 129, 0.08)' }}
              />
              <div
                className={styles.volumeBar}
                style={{ width: `${(level.quantity / maxQty) * 100}%`, background: 'rgba(14, 203, 129, 0.15)' }}
              />
              <span className={`${styles.price} text-green`}>{formatPrice(level.price)}</span>
              <span className={styles.qty}>{formatQty(level.quantity)}</span>
              <span className={styles.total}>{formatQty(level.price * level.quantity)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
