'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import ko from '@/i18n/ko.json';
import en from '@/i18n/en.json';

type Locale = 'ko' | 'en';
type Messages = typeof ko;

interface I18nContextType {
  locale: Locale;
  messages: Messages;
  t: (key: string) => string;
  setLocale: (locale: Locale) => void;
  currency: string;
  currencySymbol: string;
  formatPrice: (price: number) => string;
  formatNumber: (num: number, decimals?: number) => string;
}

const locales: Record<Locale, Messages> = { ko, en };

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('ko');
  const messages = locales[locale];

  const t = useCallback((key: string): string => {
    const keys = key.split('.');
    let result: unknown = messages;
    for (const k of keys) {
      if (result && typeof result === 'object') {
        result = (result as Record<string, unknown>)[k];
      } else {
        return key;
      }
    }
    return typeof result === 'string' ? result : key;
  }, [messages]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    if (typeof window !== 'undefined') {
      localStorage.setItem('virtutrade-locale', newLocale);
    }
  }, []);

  // KRW exchange rate (approximate)
  const KRW_RATE = 1430;

  const formatPrice = useCallback((usdPrice: number): string => {
    if (locale === 'ko') {
      const krwPrice = usdPrice * KRW_RATE;
      if (krwPrice >= 1000000) {
        return '₩' + krwPrice.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
      }
      return '₩' + krwPrice.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
    }
    if (usdPrice >= 1) {
      return '$' + usdPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return '$' + usdPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  }, [locale]);

  const formatNumber = useCallback((num: number, decimals: number = 2): string => {
    return num.toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }, [locale]);

  return (
    <I18nContext.Provider value={{
      locale,
      messages,
      t,
      setLocale,
      currency: locale === 'ko' ? 'KRW' : 'USD',
      currencySymbol: locale === 'ko' ? '₩' : '$',
      formatPrice,
      formatNumber,
    }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider');
  return context;
}
