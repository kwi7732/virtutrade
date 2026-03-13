'use client';

import { useTrade } from '@/contexts/TradeContext';
import { useI18n } from '@/contexts/I18nContext';
import styles from './AssetBar.module.css';

export default function AssetBar() {
  const { state } = useTrade();
  const { t, formatPrice, formatNumber } = useI18n();
  const { ticker } = state;

  if (!ticker) {
    return (
      <div className={`${styles.bar} asset-bar`}>
        <div className={styles.loading}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  const isUp = ticker.priceChangePercent >= 0;

  return (
    <div className={`${styles.bar} asset-bar`} id="asset-bar">
      <div className={styles.priceSection}>
        <span className={`${styles.currentPrice} ${isUp ? 'text-green' : 'text-red'}`}>
          {formatPrice(ticker.price)}
        </span>
        <span className={`${styles.change} ${isUp ? 'text-green' : 'text-red'}`}>
          {isUp ? '+' : ''}{ticker.priceChangePercent.toFixed(2)}%
        </span>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.label}>{t('trade.high24h')}</span>
          <span className={styles.value}>{formatPrice(ticker.high24h)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.label}>{t('trade.low24h')}</span>
          <span className={styles.value}>{formatPrice(ticker.low24h)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.label}>{t('trade.volume24h')}</span>
          <span className={styles.value}>{formatNumber(ticker.volume24h, 2)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.label}>{t('trade.change24h')}</span>
          <span className={`${styles.value} ${isUp ? 'text-green' : 'text-red'}`}>
            {isUp ? '+' : ''}{formatPrice(ticker.priceChange)}
          </span>
        </div>
      </div>
    </div>
  );
}
