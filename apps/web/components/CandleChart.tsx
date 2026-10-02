'use client';

import type { Candle, Direction } from '@marketroom/core';
import { createChart, type IChartApi, ColorType } from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';

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

/**
 * Read a design token at runtime, because a canvas cannot inherit CSS custom
 * properties the way the rest of the app does.
 *
 * Only ever called from inside the effect below, so `document` is guaranteed —
 * and that is what lets this file hold no raw colour values at all, which is
 * the rule everywhere outside `tokens.css`.
 */
const token = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function CandleChart({ candles, direction, height = 300 }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  /**
   * The canvas cannot inherit CSS variables — token values are read once and
   * baked into the chart's options. So the chart has to be told when the theme
   * changes, or its grid, axes and crosshair keep the previous theme's colours:
   * switching to light left black grid lines drawn across a white panel.
   */
  const [themeTick, setThemeTick] = useState(0);

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeTick((tick) => tick + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || candles.length === 0) return;

    const lineColor =
      direction === 'up'
        ? token('--mr-up')
        : direction === 'down'
          ? token('--mr-down')
          : token('--mr-flat');

    const chart = createChart(container, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: token('--mr-text-subtle'),
        fontFamily: token('--mr-font-mono'),
        fontSize: 10,
      },
      // Untinted, low-contrast grid — chrome recedes so the series reads.
      grid: {
        vertLines: { visible: false },
        horzLines: { color: token('--mr-border-subtle') },
      },
      rightPriceScale: { borderColor: token('--mr-border') },
      timeScale: {
        borderColor: token('--mr-border'),
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: {
          color: token('--mr-border-strong'),
          labelBackgroundColor: token('--mr-surface-raised'),
        },
        horzLine: {
          color: token('--mr-border-strong'),
          labelBackgroundColor: token('--mr-surface-raised'),
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
      // Appending hex alpha to the resolved token. Valid because every
      // direction token is a 6-digit hex; if one ever becomes rgb()/oklch()
      // this needs color-mix() instead.
      topColor: `${lineColor}2e`,
      bottomColor: `${lineColor}00`,
      lineWidth: 2,
      priceLineVisible: false,
      crosshairMarkerBorderColor: lineColor,
      crosshairMarkerBackgroundColor: token('--mr-bg'),
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
    // `themeTick` is not read in the body — it is the signal to rebuild the
    // chart with freshly resolved token values after a theme switch.
  }, [candles, direction, height, themeTick]);

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
