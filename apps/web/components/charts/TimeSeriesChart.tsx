'use client';

import { formatCompactUsd, formatPrice } from '@marketroom/core';
import { ColorType, createChart, type IChartApi } from 'lightweight-charts';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * An interactive time series: area or candles, a crosshair that reads out the
 * value, and range buttons. Canvas (TradingView lightweight-charts) — the
 * same engine as the tokenized-asset price charts.
 *
 * Points arrive from the server; ranges filter on the client, so switching
 * costs nothing. Colours come from design tokens at runtime and are re-read
 * when the theme changes.
 */

export type SeriesFormat = 'usd' | 'price' | 'count' | 'rate';

export interface TimePoint {
  readonly t: number;
  readonly v: number;
}

export interface Candle {
  readonly t: number;
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
}

const RANGES = [
  { id: '1M', days: 30 },
  { id: '3M', days: 90 },
  { id: '6M', days: 182 },
  { id: '1Y', days: 365 },
  { id: 'All', days: Infinity },
] as const;

const format = (kind: SeriesFormat, v: number) =>
  kind === 'usd'
    ? formatCompactUsd(v)
    : kind === 'price'
      ? formatPrice(v)
      : kind === 'rate'
        ? `${Math.round(v).toLocaleString('en-US')}/h`
        : Math.round(v).toLocaleString('en-US');

const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function TimeSeriesChart({
  points,
  candles,
  kind = 'usd',
  height = 280,
  label,
  defaultRange = '1Y',
  note,
}: {
  points?: readonly TimePoint[];
  candles?: readonly Candle[];
  kind?: SeriesFormat;
  height?: number;
  label: string;
  defaultRange?: (typeof RANGES)[number]['id'];
  /** Source and freshness, printed under the chart. */
  note?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [range, setRange] = useState<string>(defaultRange);
  const [hover, setHover] = useState<{ t: number; v: number } | null>(null);
  const [mode, setMode] = useState<'area' | 'candles'>(candles?.length ? 'candles' : 'area');
  const [themeTick, setThemeTick] = useState(0);

  const all = useMemo(
    () =>
      (points ?? candles?.map((c) => ({ t: c.t, v: c.c })) ?? []).filter((p) =>
        Number.isFinite(p.v),
      ),
    [points, candles],
  );
  const span = all.length ? all[all.length - 1]!.t - all[0]!.t : 0;
  const available = RANGES.filter((r) => r.days === Infinity || span > r.days * 0.6 * 86_400_000);
  // A range the data cannot fill falls back to everything there is.
  const current = available.some((r) => r.id === range) ? range : 'All';
  const days = RANGES.find((r) => r.id === current)?.days ?? Infinity;
  const end = all.length ? all[all.length - 1]!.t : 0;
  const start = days === Infinity ? -Infinity : end - days * 86_400_000;
  const shown = all.filter((p) => p.t >= start);
  const shownCandles = (candles ?? []).filter((c) => c.t >= start);
  const first = shown[0]?.v ?? null;
  const last = shown[shown.length - 1]?.v ?? null;
  const change = first && last ? last / first - 1 : null;
  const up = change === null || change >= 0;

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeTick((x) => x + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = container.current;
    if (!el || shown.length < 2) return;
    const lineColor = token(up ? '--mr-up' : '--mr-down');
    const chart = createChart(el, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: token('--mr-text-subtle'),
        fontFamily: token('--mr-font-mono'),
        fontSize: 10,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: token('--mr-border-subtle') } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: false },
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
      localization: { priceFormatter: (v: number) => format(kind, v) },
    });
    chartRef.current = chart;

    if (mode === 'candles' && shownCandles.length > 1) {
      const series = chart.addCandlestickSeries({
        upColor: token('--mr-up'),
        downColor: token('--mr-down'),
        wickUpColor: token('--mr-up'),
        wickDownColor: token('--mr-down'),
        borderVisible: false,
        priceLineVisible: false,
      });
      series.setData(
        shownCandles.map((c) => ({
          time: Math.floor(c.t / 1000) as never,
          open: c.o,
          high: c.h,
          low: c.l,
          close: c.c,
        })),
      );
    } else {
      const series = chart.addAreaSeries({
        lineColor,
        // Hex alpha on a resolved 6-digit token; see CandleChart for the caveat.
        topColor: `${lineColor}40`,
        bottomColor: `${lineColor}00`,
        lineWidth: 2,
        priceLineVisible: false,
        crosshairMarkerBorderColor: lineColor,
        crosshairMarkerBackgroundColor: token('--mr-bg'),
      });
      series.setData(shown.map((p) => ({ time: Math.floor(p.t / 1000) as never, value: p.v })));
    }
    chart.timeScale().fitContent();

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) return setHover(null);
      const t = (param.time as number) * 1000;
      const p = shown.find((x) => Math.floor(x.t / 1000) * 1000 === t);
      setHover(p ? { t, v: p.v } : null);
    });

    const attribution = el.querySelector<HTMLAnchorElement>('a[href*="tradingview"]');
    if (attribution) {
      attribution.rel = 'noopener noreferrer';
      attribution.setAttribute('aria-label', 'Charting by TradingView (opens in a new tab)');
    }
    const resize = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) chart.applyOptions({ width });
    });
    resize.observe(el);
    return () => {
      resize.disconnect();
      chart.remove();
      chartRef.current = null;
    };
    // `themeTick` re-resolves token colours after a theme switch.
  }, [current, mode, themeTick, height, kind, all, candles]);

  if (all.length < 2) return <p className="rx-empty">No history recorded yet.</p>;
  const dateFmt = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const readout = hover ?? (last !== null ? { t: shown[shown.length - 1]!.t, v: last } : null);

  return (
    <figure className="rx-ts" aria-label={label}>
      <div className="rx-ts-head">
        <div className="rx-ts-readout" aria-live="off">
          {readout && (
            <>
              <span className="rx-ts-value mr-num">{format(kind, readout.v)}</span>
              {!hover && change !== null && (
                <span className={`rx-ts-change mr-num ${up ? 'rx-up' : 'rx-down'}`}>
                  {up ? '▲' : '▼'} {Math.abs(change * 100).toFixed(2)}%
                </span>
              )}
              <span className="rx-ts-date">{dateFmt.format(readout.t)}</span>
            </>
          )}
        </div>
        <div className="rx-ts-controls">
          {candles?.length ? (
            <div className="rx-seg is-small" role="group" aria-label="Chart type">
              <button type="button" aria-pressed={mode === 'area'} onClick={() => setMode('area')}>
                Line
              </button>
              <button
                type="button"
                aria-pressed={mode === 'candles'}
                onClick={() => setMode('candles')}
              >
                Candles
              </button>
            </div>
          ) : null}
          <div className="rx-seg is-small" role="group" aria-label="Chart range">
            {available.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={current === r.id}
                onClick={() => setRange(r.id)}
              >
                {r.id}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div ref={container} className="rx-ts-canvas" style={{ height }} />
      {note && <figcaption className="rx-footnote">{note}</figcaption>}
      <p className="sr-only">
        {label}: {first !== null ? format(kind, first) : '—'} on{' '}
        {shown[0] ? dateFmt.format(shown[0].t) : '—'}, {last !== null ? format(kind, last) : '—'} on{' '}
        {shown.length ? dateFmt.format(shown[shown.length - 1]!.t) : '—'}.
      </p>
    </figure>
  );
}
