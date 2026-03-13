'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createChart, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, HistogramData, Time } from 'lightweight-charts';
import { useTrade } from '@/contexts/TradeContext';
import styles from './TradingChart.module.css';

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

export default function TradingChart() {
  const { state, setInterval } = useTrade();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candleSeriesRef = useRef<ISeriesApi<any> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const prevKlineLenRef = useRef(0);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#1e2329' },
        textColor: '#848e9c',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#2b3139' },
        horzLines: { color: '#2b3139' },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: '#5e6673', width: 1, style: 2 },
        horzLine: { color: '#5e6673', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: '#2b3139',
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor: '#2b3139',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScale: { axisPressedMouseMove: { time: true, price: true } },
      handleScroll: { vertTouchDrag: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#0ecb81',
      downColor: '#f6465d',
      borderUpColor: '#0ecb81',
      borderDownColor: '#f6465d',
      wickUpColor: '#0ecb81',
      wickDownColor: '#f6465d',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // Update data when klines change
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || state.klines.length === 0) return;

    const candleData: CandlestickData<Time>[] = state.klines.map(k => ({
      time: k.time as Time,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
    }));

    const volumeData: HistogramData<Time>[] = state.klines.map(k => ({
      time: k.time as Time,
      value: k.volume,
      color: k.close >= k.open ? 'rgba(14, 203, 129, 0.3)' : 'rgba(246, 70, 93, 0.3)',
    }));

    // Full replace on initial load or symbol change, update on streaming
    if (prevKlineLenRef.current === 0 || Math.abs(state.klines.length - prevKlineLenRef.current) > 5) {
      candleSeriesRef.current.setData(candleData);
      volumeSeriesRef.current.setData(volumeData);
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
    } else {
      // Streaming update — just update last candle
      const lastCandle = candleData[candleData.length - 1];
      const lastVolume = volumeData[volumeData.length - 1];
      if (lastCandle) candleSeriesRef.current.update(lastCandle);
      if (lastVolume) volumeSeriesRef.current.update(lastVolume);
    }

    prevKlineLenRef.current = state.klines.length;
  }, [state.klines]);

  // Reset on symbol change
  useEffect(() => {
    prevKlineLenRef.current = 0;
  }, [state.symbol]);

  const handleIntervalChange = useCallback((interval: string) => {
    prevKlineLenRef.current = 0;
    setInterval(interval);
  }, [setInterval]);

  return (
    <div className={`${styles.container} chart-area`} id="chart-area">
      <div className={styles.toolbar}>
        <div className={styles.intervals}>
          {INTERVALS.map(iv => (
            <button
              key={iv}
              className={`${styles.intervalBtn} ${state.interval === iv ? styles.active : ''}`}
              onClick={() => handleIntervalChange(iv)}
            >
              {iv}
            </button>
          ))}
        </div>
        <div className={styles.indicators}>
          <span className={styles.indicatorLabel}>MA</span>
          <span className={styles.indicatorLabel}>RSI</span>
        </div>
      </div>
      <div ref={chartContainerRef} className={styles.chart} />
    </div>
  );
}
