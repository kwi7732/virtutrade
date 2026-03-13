'use client';

import { useState } from 'react';
import { useTrade } from '@/contexts/TradeContext';
import { useI18n } from '@/contexts/I18nContext';
import styles from './UserOrders.module.css';

type Tab = 'openOrders' | 'orderHistory' | 'assets' | 'positions';

export default function UserOrders() {
  const { state, cancelOrder, closeFuturesPosition } = useTrade();
  const { t, formatPrice, formatNumber } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>(state.tradeMode === 'futures' ? 'positions' : 'openOrders');

  const openOrders = state.orders.filter(o => o.status === 'OPEN');
  const filledOrders = state.orders.filter(o => o.status === 'FILLED' || o.status === 'CANCELLED');

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleString('en-US', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className={`${styles.container} bottom-panel`} id="user-orders">
      <div className={styles.tabs}>
        {state.tradeMode === 'futures' && (
          <button
            className={`${styles.tab} ${activeTab === 'positions' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('positions')}
          >
            {t('futures.positions')}
            {state.positions.length > 0 && <span className={styles.badge}>{state.positions.length}</span>}
          </button>
        )}
        <button
          className={`${styles.tab} ${activeTab === 'openOrders' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('openOrders')}
        >
          {t('trade.openOrders')}
          {openOrders.length > 0 && <span className={styles.badge}>{openOrders.length}</span>}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'orderHistory' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('orderHistory')}
        >
          {t('trade.orderHistory')}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'assets' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('assets')}
        >
          {t('trade.assets')}
        </button>
      </div>

      <div className={styles.content}>
        {/* ========== Positions Tab ========== */}
        {activeTab === 'positions' && (
          <>
            <div className={`${styles.tableHeader} ${styles.positionsHeader}`}>
              <span>{t('trade.pair')}</span>
              <span>{t('trade.side')}</span>
              <span>{t('futures.leverage')}</span>
              <span>{t('futures.size')}</span>
              <span>{t('futures.entryPrice')}</span>
              <span>{t('futures.markPrice')}</span>
              <span>{t('futures.liquidationPrice')}</span>
              <span>{t('futures.margin')}</span>
              <span>{t('futures.unrealizedPnl')}</span>
              <span></span>
            </div>
            {state.positions.length === 0 ? (
              <div className={styles.empty}>{t('futures.noPositions')}</div>
            ) : (
              state.positions.map(pos => {
                const pnlPercent = pos.margin > 0 ? (pos.unrealizedPnl / pos.margin) * 100 : 0;
                const isProfit = pos.unrealizedPnl >= 0;
                return (
                  <div key={pos.id} className={`${styles.tableRow} ${styles.positionsRow}`}>
                    <span>{pos.symbol.replace('USDT', '/USDT')}</span>
                    <span className={pos.side === 'LONG' ? 'text-green' : 'text-red'}>
                      {t(`futures.${pos.side.toLowerCase()}`)} {pos.leverage}x
                    </span>
                    <span className="text-mono">{pos.leverage}x</span>
                    <span className="text-mono">{pos.quantity.toFixed(4)}</span>
                    <span className="text-mono">{formatPrice(pos.entryPrice)}</span>
                    <span className="text-mono">{state.ticker ? formatPrice(state.ticker.price) : '-'}</span>
                    <span className={`text-mono ${styles.liqPriceCell}`}>{formatPrice(pos.liquidationPrice)}</span>
                    <span className="text-mono">{formatNumber(pos.margin, 2)}</span>
                    <span className={`text-mono ${isProfit ? 'text-green' : 'text-red'}`}>
                      {isProfit ? '+' : ''}{formatNumber(pos.unrealizedPnl, 2)} ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
                    </span>
                    <span>
                      <button className={styles.closeBtn} onClick={() => closeFuturesPosition(pos.id)}>
                        {t('futures.closePosition')}
                      </button>
                    </span>
                  </div>
                );
              })
            )}
          </>
        )}

        {/* ========== Open Orders Tab ========== */}
        {activeTab === 'openOrders' && (
          <>
            <div className={styles.tableHeader}>
              <span>{t('trade.time')}</span>
              <span>{t('trade.pair')}</span>
              <span>{t('trade.side')}</span>
              <span>{t('trade.type')}</span>
              <span>{t('trade.price')}</span>
              <span>{t('trade.amount')}</span>
              <span>{t('trade.filled')}</span>
              <span></span>
            </div>
            {openOrders.length === 0 ? (
              <div className={styles.empty}>{t('trade.noOpenOrders')}</div>
            ) : (
              openOrders.map(order => (
                <div key={order.id} className={styles.tableRow}>
                  <span className={styles.cellTime}>{formatTime(order.createdAt)}</span>
                  <span>{order.symbol.replace('USDT', '/USDT')}</span>
                  <span className={order.side === 'BUY' ? 'text-green' : 'text-red'}>{t(`trade.${order.side.toLowerCase()}`)}</span>
                  <span>{t(`trade.${order.type.toLowerCase()}`)}</span>
                  <span className="text-mono">{formatPrice(order.price)}</span>
                  <span className="text-mono">{order.quantity.toFixed(6)}</span>
                  <span className="text-mono">{((order.filledQuantity / order.quantity) * 100).toFixed(0)}%</span>
                  <span>
                    <button className={styles.cancelBtn} onClick={() => cancelOrder(order.id)}>
                      {t('trade.cancel')}
                    </button>
                  </span>
                </div>
              ))
            )}
          </>
        )}

        {/* ========== Order History Tab ========== */}
        {activeTab === 'orderHistory' && (
          <>
            <div className={styles.tableHeader}>
              <span>{t('trade.time')}</span>
              <span>{t('trade.pair')}</span>
              <span>{t('trade.side')}</span>
              <span>{t('trade.type')}</span>
              <span>{t('trade.avgPrice')}</span>
              <span>{t('trade.amount')}</span>
              <span>{t('trade.status')}</span>
              <span>{t('trade.fee')}</span>
            </div>
            {filledOrders.length === 0 ? (
              <div className={styles.empty}>{t('trade.noOrderHistory')}</div>
            ) : (
              filledOrders.map(order => (
                <div key={order.id} className={styles.tableRow}>
                  <span className={styles.cellTime}>{formatTime(order.createdAt)}</span>
                  <span>{order.symbol.replace('USDT', '/USDT')}</span>
                  <span className={order.side === 'BUY' ? 'text-green' : 'text-red'}>{t(`trade.${order.side.toLowerCase()}`)}</span>
                  <span>{t(`trade.${order.type.toLowerCase()}`)}</span>
                  <span className="text-mono">{order.avgFillPrice > 0 ? formatPrice(order.avgFillPrice) : '-'}</span>
                  <span className="text-mono">{order.filledQuantity.toFixed(6)}</span>
                  <span className={order.status === 'FILLED' ? 'text-green' : 'text-red'}>
                    {order.status}
                  </span>
                  <span className="text-mono">
                    {order.avgFillPrice > 0 ? formatPrice(order.avgFillPrice * order.filledQuantity * 0.001) : '-'}
                  </span>
                </div>
              ))
            )}
          </>
        )}

        {/* ========== Assets Tab ========== */}
        {activeTab === 'assets' && (
          <>
            <div className={`${styles.tableHeader} ${styles.assetsHeader}`}>
              <span>{t('assets.coin')}</span>
              <span>{t('assets.quantity')}</span>
              <span>{t('assets.avgBuyPrice')}</span>
              <span>{t('assets.evalAmount')}</span>
            </div>
            {state.portfolio.map(asset => (
              <div key={asset.asset} className={`${styles.tableRow} ${styles.assetsRow}`}>
                <span className={styles.coinName}>{asset.asset}</span>
                <span className="text-mono">{asset.balance < 1 ? asset.balance.toFixed(8) : formatNumber(asset.balance, 2)}</span>
                <span className="text-mono">{asset.avgPrice > 0 ? formatPrice(asset.avgPrice) : '-'}</span>
                <span className="text-mono">
                  {asset.asset === 'USDT'
                    ? formatPrice(asset.balance)
                    : state.ticker
                      ? formatPrice(asset.balance * state.ticker.price)
                      : '-'
                  }
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
