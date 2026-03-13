'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { useTrade } from '@/contexts/TradeContext';
import styles from './Header.module.css';

interface SymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
}

export default function Header() {
  const { user, logout } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const { state, setSymbol, setTradeMode } = useTrade();
  const [showSymbolSearch, setShowSymbolSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [allSymbols, setAllSymbols] = useState<SymbolInfo[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch all USDT pairs from Binance
  useEffect(() => {
    fetch('https://api.binance.com/api/v3/exchangeInfo')
      .then(res => res.json())
      .then(data => {
        const usdtPairs: SymbolInfo[] = data.symbols
          .filter((s: { status: string; quoteAsset: string }) => 
            s.status === 'TRADING' && s.quoteAsset === 'USDT'
          )
          .map((s: { symbol: string; baseAsset: string; quoteAsset: string }) => ({
            symbol: s.symbol,
            baseAsset: s.baseAsset,
            quoteAsset: s.quoteAsset,
          }))
          .sort((a: SymbolInfo, b: SymbolInfo) => {
            // Priority coins first
            const priority = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'MATIC', 'LINK', 'UNI'];
            const aIdx = priority.indexOf(a.baseAsset);
            const bIdx = priority.indexOf(b.baseAsset);
            if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
            if (aIdx !== -1) return -1;
            if (bIdx !== -1) return 1;
            return a.baseAsset.localeCompare(b.baseAsset);
          });
        setAllSymbols(usdtPairs);
      })
      .catch(console.error);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSymbolSearch(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when dropdown opens
  useEffect(() => {
    if (showSymbolSearch && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showSymbolSearch]);

  const filteredSymbols = useMemo(() => {
    if (!searchQuery) return allSymbols.slice(0, 100);
    const q = searchQuery.toUpperCase();
    return allSymbols.filter(s => 
      s.baseAsset.includes(q) || s.symbol.includes(q)
    ).slice(0, 50);
  }, [allSymbols, searchQuery]);

  const handleSelectSymbol = (symbol: string) => {
    setSymbol(symbol);
    setShowSymbolSearch(false);
    setSearchQuery('');
  };

  const displaySymbol = state.symbol.replace('USDT', '/USDT');

  return (
    <header className={styles.header} id="main-header">
      <div className={styles.left}>
        <div className={styles.logo}>VirtuTrade</div>

        {/* Symbol Selector with Search */}
        <div className={styles.symbolSelector} ref={dropdownRef}>
          <button 
            className={styles.symbolBtn}
            onClick={() => setShowSymbolSearch(!showSymbolSearch)}
            id="symbol-selector"
          >
            <span className={styles.symbolText}>{displaySymbol}</span>
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
              <path d="M1 1L5 5L9 1" stroke="#848e9c" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>

          {showSymbolSearch && (
            <div className={styles.dropdown}>
              <div className={styles.searchBox}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#848e9c" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search coin..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className={styles.symbolList}>
                {filteredSymbols.map(s => (
                  <button
                    key={s.symbol}
                    className={`${styles.symbolItem} ${s.symbol === state.symbol ? styles.symbolItemActive : ''}`}
                    onClick={() => handleSelectSymbol(s.symbol)}
                  >
                    <span className={styles.symbolItemBase}>{s.baseAsset}</span>
                    <span className={styles.symbolItemQuote}>/{s.quoteAsset}</span>
                  </button>
                ))}
                {filteredSymbols.length === 0 && (
                  <div className={styles.noResults}>No results</div>
                )}
              </div>
            </div>
          )}
        </div>

        <nav className={styles.nav}>
          <button
            className={`${styles.modeBtn} ${state.tradeMode === 'spot' ? styles.modeBtnActive : ''}`}
            onClick={() => setTradeMode('spot')}
          >
            {t('trade.spot')}
          </button>
          <button
            className={`${styles.modeBtn} ${state.tradeMode === 'futures' ? styles.modeBtnActive : ''}`}
            onClick={() => setTradeMode('futures')}
          >
            {t('futures.title')}
          </button>
        </nav>
      </div>

      <div className={styles.right}>
        <div className={styles.connectionStatus}>
          <span className={`${styles.statusDot} ${state.connected ? styles.dotOnline : styles.dotOffline}`} />
          <span className={styles.statusText}>{state.connected ? 'Live' : '...'}</span>
        </div>

        <button
          className={styles.langBtn}
          onClick={() => setLocale(locale === 'ko' ? 'en' : 'ko')}
          id="language-toggle"
        >
          {locale === 'ko' ? '🇰🇷 KRW' : '🇺🇸 USD'}
        </button>
        
        <div className={styles.user}>
          <span className={styles.userName}>
            {user?.displayName || user?.email}
          </span>
          <button className={styles.logoutBtn} onClick={logout} id="logout-btn">
            {t('common.logout')}
          </button>
        </div>
      </div>
    </header>
  );
}
