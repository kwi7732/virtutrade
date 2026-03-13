'use client';

import { useTrade } from '@/contexts/TradeContext';
import { useI18n } from '@/contexts/I18nContext';
import styles from './RecentTrades.module.css';

export default function RecentTrades() {
  const { state, setSelectedPrice } = useTrade();
  const { t, formatPrice } = useI18n();

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatQty = (qty: number) => {
    if (qty >= 1) return qty.toFixed(4);
    if (qty >= 0.01) return qty.toFixed(5);
    return qty.toFixed(6);
  };

  return (
    <div className={styles.container} id="recent-trades">
      <div className={styles.header}>
        <span>{t('trade.recentTrades')}</span>
      </div>

      <div className={styles.columnHeaders}>
        <span>{t('trade.price')}</span>
        <span>{t('trade.quantity')}</span>
        <span>{t('trade.time')}</span>
      </div>

      <div className={styles.trades}>
        {state.recentTrades.slice(0, 30).map((trade) => (
          <div
            key={trade.id}
            className={styles.row}
            onClick={() => setSelectedPrice(trade.price)}
          >
            <span className={trade.isBuyerMaker ? 'text-red' : 'text-green'}>
              {formatPrice(trade.price)}
            </span>
            <span className={styles.qty}>{formatQty(trade.quantity)}</span>
            <span className={styles.time}>{formatTime(trade.time)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
