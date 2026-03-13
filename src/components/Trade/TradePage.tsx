'use client';

import { TradeProvider, useTrade } from '@/contexts/TradeContext';
import Header from '@/components/Header/Header';
import AssetBar from '@/components/AssetBar/AssetBar';
import TradingChart from '@/components/Chart/TradingChart';
import OrderBook from '@/components/OrderBook/OrderBook';
import TradeForm from '@/components/TradeForm/TradeForm';
import FuturesTradeForm from '@/components/FuturesTradeForm/FuturesTradeForm';
import RecentTrades from '@/components/RecentTrades/RecentTrades';
import UserOrders from '@/components/UserOrders/UserOrders';
import ResizableLayout from '@/components/ResizableLayout/ResizableLayout';
import styles from '@/components/TradePage/TradePage.module.css';

function TradeContent() {
  const { state } = useTrade();

  return (
    <div className={styles.wrapper}>
      <Header />
      <div className={styles.assetBar}>
        <AssetBar />
      </div>
      {/* Desktop: vertical split between trading area and bottom orders */}
      <div className={styles.desktopBody}>
        <ResizableLayout
          defaultSizes={[75, 25]}
          minSizes={[200, 120]}
          direction="vertical"
        >
          <div className={styles.mainContent}>
            <ResizableLayout
              defaultSizes={[45, 17, 17, 21]}
              minSizes={[300, 160, 160, 200]}
            >
              <div className={styles.chartPanel}>
                <TradingChart />
              </div>
              <div className={styles.obPanel}>
                <OrderBook />
              </div>
              <div className={styles.tradesPanel}>
                <RecentTrades />
              </div>
              <div className={styles.formPanel}>
                {state.tradeMode === 'spot' ? <TradeForm /> : <FuturesTradeForm />}
              </div>
            </ResizableLayout>
          </div>
          <div className={styles.bottomPanel}>
            <UserOrders />
          </div>
        </ResizableLayout>
      </div>

      {/* Mobile: vertical stacked layout (no splitters) */}
      <div className={styles.mobileLayout}>
        <div className={styles.mobileChart}>
          <TradingChart />
        </div>
        <div className={styles.mobileOb}>
          <OrderBook />
        </div>
        <div className={styles.mobileForm}>
          {state.tradeMode === 'spot' ? <TradeForm /> : <FuturesTradeForm />}
        </div>
        <div className={styles.mobileBottom}>
          <UserOrders />
        </div>
      </div>
    </div>
  );
}

export default function TradePage() {
  return (
    <TradeProvider>
      <TradeContent />
    </TradeProvider>
  );
}
