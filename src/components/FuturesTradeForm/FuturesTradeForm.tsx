'use client';

import { useState, useMemo } from 'react';
import { useTrade } from '@/contexts/TradeContext';
import { useI18n } from '@/contexts/I18nContext';
import type { PositionSide } from '@/contexts/TradeContext';
import styles from './FuturesTradeForm.module.css';

const LEVERAGE_OPTIONS = [1, 2, 3, 5, 10, 20, 25, 50, 75, 100, 125];

export default function FuturesTradeForm() {
  const { state, openFuturesPosition } = useTrade();
  const { t, formatPrice, formatNumber } = useI18n();
  const [side, setSide] = useState<PositionSide>('LONG');
  const [leverage, setLeverage] = useState(10);
  const [showLeverageSlider, setShowLeverageSlider] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [marginInput, setMarginInput] = useState('');
  const [inputMode, setInputMode] = useState<'quantity' | 'margin'>('margin');

  const currentPrice = state.ticker?.price || 0;
  const availableBalance = state.futuresBalance - state.futuresMarginUsed;

  // Calculate derived values
  const derived = useMemo(() => {
    if (inputMode === 'margin' && marginInput) {
      const m = parseFloat(marginInput);
      if (isNaN(m) || m <= 0) return { qty: 0, margin: 0, notional: 0, liqPrice: 0 };
      const notional = m * leverage;
      const qty = currentPrice > 0 ? notional / currentPrice : 0;
      const liqPrice = side === 'LONG'
        ? currentPrice * (1 - (1 / leverage) + 0.005)
        : currentPrice * (1 + (1 / leverage) - 0.005);
      return { qty, margin: m, notional, liqPrice };
    } else if (quantity) {
      const qty = parseFloat(quantity);
      if (isNaN(qty) || qty <= 0) return { qty: 0, margin: 0, notional: 0, liqPrice: 0 };
      const notional = qty * currentPrice;
      const margin = notional / leverage;
      const liqPrice = side === 'LONG'
        ? currentPrice * (1 - (1 / leverage) + 0.005)
        : currentPrice * (1 + (1 / leverage) - 0.005);
      return { qty, margin, notional, liqPrice };
    }
    return { qty: 0, margin: 0, notional: 0, liqPrice: 0 };
  }, [quantity, marginInput, inputMode, leverage, currentPrice, side]);

  const handlePercentage = (pct: number) => {
    const maxMargin = availableBalance * (pct / 100);
    setInputMode('margin');
    setMarginInput(maxMargin.toFixed(2));
    setQuantity('');
  };

  const handleSubmit = () => {
    if (derived.qty <= 0 || derived.margin > availableBalance) return;
    openFuturesPosition(side, derived.qty, leverage);
    setQuantity('');
    setMarginInput('');
  };

  return (
    <div className={`${styles.container} trade-form-area`} id="futures-trade-form">
      {/* Side Toggle */}
      <div className={styles.sideToggle}>
        <button
          className={`${styles.sideBtn} ${side === 'LONG' ? styles.longActive : ''}`}
          onClick={() => setSide('LONG')}
        >
          {t('futures.long')}
        </button>
        <button
          className={`${styles.sideBtn} ${side === 'SHORT' ? styles.shortActive : ''}`}
          onClick={() => setSide('SHORT')}
        >
          {t('futures.short')}
        </button>
      </div>

      {/* Leverage Selector */}
      <div className={styles.leverageSection}>
        <button
          className={styles.leverageBtn}
          onClick={() => setShowLeverageSlider(!showLeverageSlider)}
        >
          <span className={styles.leverageIcon}>⚡</span>
          <span className={styles.leverageValue}>{leverage}x</span>
          <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
            <path d="M1 1L4 4L7 1" stroke="#848e9c" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>

        {showLeverageSlider && (
          <div className={styles.leverageDropdown}>
            <div className={styles.leverageLabel}>{t('futures.adjustLeverage')}</div>
            <div className={styles.leverageGrid}>
              {LEVERAGE_OPTIONS.map(l => (
                <button
                  key={l}
                  className={`${styles.leverageOption} ${leverage === l ? styles.leverageSelected : ''}`}
                  onClick={() => { setLeverage(l); setShowLeverageSlider(false); }}
                >
                  {l}x
                </button>
              ))}
            </div>
            <input
              type="range"
              min={1}
              max={125}
              value={leverage}
              onChange={(e) => setLeverage(parseInt(e.target.value))}
              className={styles.leverageRange}
            />
          </div>
        )}
      </div>

      {/* Available Balance */}
      <div className={styles.balanceRow}>
        <span className={styles.balanceLabel}>{t('futures.availableMargin')}</span>
        <span className={styles.balanceValue}>{formatNumber(availableBalance, 2)} USDT</span>
      </div>

      {/* Margin Input */}
      <div className={styles.inputGroup}>
        <label className={styles.inputLabel}>{t('futures.margin')} (USDT)</label>
        <input
          type="number"
          className={`input-field ${styles.input}`}
          value={marginInput}
          onChange={(e) => { setMarginInput(e.target.value); setInputMode('margin'); setQuantity(''); }}
          placeholder="0.00"
        />
      </div>

      {/* Quantity Input */}
      <div className={styles.inputGroup}>
        <label className={styles.inputLabel}>{t('trade.quantity')} ({state.symbol.replace('USDT', '')})</label>
        <input
          type="number"
          className={`input-field ${styles.input}`}
          value={quantity || (derived.qty > 0 && inputMode === 'margin' ? derived.qty.toFixed(6) : '')}
          onChange={(e) => { setQuantity(e.target.value); setInputMode('quantity'); setMarginInput(''); }}
          placeholder="0.000000"
        />
      </div>

      {/* Percentage Buttons */}
      <div className={styles.pctGroup}>
        {[25, 50, 75, 100].map(pct => (
          <button key={pct} className={styles.pctBtn} onClick={() => handlePercentage(pct)}>
            {pct}%
          </button>
        ))}
      </div>

      {/* Order Summary */}
      {derived.qty > 0 && (
        <div className={styles.summary}>
          <div className={styles.summaryRow}>
            <span>{t('futures.entryPrice')}</span>
            <span className="text-mono">{formatPrice(currentPrice)}</span>
          </div>
          <div className={styles.summaryRow}>
            <span>{t('futures.notionalValue')}</span>
            <span className="text-mono">{formatPrice(derived.notional)}</span>
          </div>
          <div className={styles.summaryRow}>
            <span>{t('futures.margin')}</span>
            <span className="text-mono">{formatNumber(derived.margin, 2)} USDT</span>
          </div>
          <div className={styles.summaryRow}>
            <span>{t('futures.liquidationPrice')}</span>
            <span className={`text-mono ${styles.liqPrice}`}>{formatPrice(derived.liqPrice)}</span>
          </div>
          <div className={styles.summaryRow}>
            <span>{t('futures.fee')}</span>
            <span className="text-mono">{formatNumber(derived.notional * 0.0004, 4)} USDT</span>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <button
        className={`${styles.submitBtn} ${side === 'LONG' ? styles.submitLong : styles.submitShort}`}
        onClick={handleSubmit}
        disabled={derived.qty <= 0 || derived.margin > availableBalance}
      >
        {side === 'LONG' ? `${t('futures.openLong')}` : `${t('futures.openShort')}`}
        {' '}{state.symbol.replace('USDT', '')}
      </button>
    </div>
  );
}
