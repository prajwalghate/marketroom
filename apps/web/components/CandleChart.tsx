'use client';

import type { Candle, Direction } from '@marketroom/core';
import { createChart, type IChartApi, ColorType } from 'lightweight-charts';
import { useEffect, useRef } from 'react';

/**
 * Candle chart.
 *
 * Canvas-based (TradingView lightweight-charts) rather than SVG: an SVG chart
 * re-renders thousands of DOM nodes on every update and drops frames once live
 * candles start streaming.
 *
 * The data arrives as a prop from the server, already fetched — this component
 * only draws it. That is why the chart appears with the page instead of after a
 * client-side request, and why there is no loading state to design.
 */

export interface CandleChartProps {
  candles: readonly Candle[];
  direction: Direction;
  height?: number;
}

/** Read a design token at runtime so the chart follows the theme. */
const token = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
};

export function CandleChart({ candles, direction, height = 300 }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || candles.length === 0) return;

    const lineColor =
      direction === 'up'
        ? token('--mr-up', '#4e9e78')
        : direction === 'down'
          ? token('--mr-down', '#c2706b')
          : token('--mr-flat', '#78808a');

    const chart = createChart(container, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: token('--mr-text-subtle', '#6a717a'),
        fontFamily: token('--mr-font-mono', 'monospace'),
        fontSize: 10,
      },
      // Untinted, low-contrast grid — chrome recedes so the series reads.
      grid: {
        vertLines: { visible: false },
        horzLines: { color: token('--mr-border-subtle', '#1c2024') },
      },
      rightPriceScale: { borderColor: token('--mr-border', '#262a2f') },
      timeScale: {
        borderColor: token('--mr-border', '#262a2f'),
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: {
          color: token('--mr-border-strong', '#343a41'),
          labelBackgroundColor: token('--mr-surface-raised', '#272c31'),
        },
        horzLine: {
          color: token('--mr-border-strong', '#343a41'),
          labelBackgroundColor: token('--mr-surface-raised', '#272c31'),
        },
      },
      // The chart must not capture the page's scroll. By default
      // lightweight-charts treats a wheel event as a time-axis zoom, so
      // scrolling down the page over the chart silently rescales it instead of
      // moving the page — which reads as the page being stuck.
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: false,
        mouseWheel: false,
        pinch: true,
        axisDoubleClickReset: true,
      },
    });

    chartRef.current = chart;

    const series = chart.addAreaSeries({
      lineColor,
      topColor: `${lineColor}2e`,
      bottomColor: `${lineColor}00`,
      lineWidth: 2,
      priceLineVisible: false,
      crosshairMarkerBorderColor: lineColor,
      crosshairMarkerBackgroundColor: token('--mr-bg', '#0b0c0e'),
    });

    series.setData(
      candles.map((candle) => ({
        // lightweight-charts expects seconds, the API gives milliseconds.
        time: (candle.time / 1000) as never,
        value: candle.close,
      })),
    );

    chart.timeScale().fitContent();

    // Keep the canvas sized to its container across layout changes.
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) chart.applyOptions({ width });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, direction, height]);

  return (
    <div
      style={{
        background: 'var(--mr-surface-1)',
        border: '1px solid var(--mr-border)',
        borderRadius: 'var(--mr-radius-lg)',
        padding: 10,
      }}
    >
      <div ref={containerRef} style={{ width: '100%', height }} />
    </div>
  );
}
