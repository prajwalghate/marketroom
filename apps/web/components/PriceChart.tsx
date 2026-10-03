'use client';

import type { Candle, Direction } from '@marketroom/core';
import { CANDLE_RANGES, DEFAULT_CANDLE_RANGE, seriesChange } from '@marketroom/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CandleChart } from './CandleChart';

/**
 * Price chart with range selection.
 *
 * The default range is server-rendered, so the first paint already has a
 * chart — switching ranges is the only thing that costs a request. Fetching
 * every range up front would mean 110 pages × 5 ranges of upstream calls at
 * build time for windows most readers never open.
 *
 * Fetched ranges are kept, so going back to one already seen is instant. The
 * in-flight state is a quiet label rather than a spinner over the chart: the
 * previous range stays on screen while the next loads, which reads as a chart
 * updating rather than a chart disappearing.
 */

export interface PriceChartProps {
  assetId: string;
  /** Candles for `DEFAULT_CANDLE_RANGE`, rendered on the server. */
  initialCandles: readonly Candle[];
}

type RangeState = Record<string, readonly Candle[]>;

export function PriceChart({ assetId, initialCandles }: PriceChartProps) {
  const [rangeId, setRangeId] = useState(DEFAULT_CANDLE_RANGE);
  const [cache, setCache] = useState<RangeState>({ [DEFAULT_CANDLE_RANGE]: initialCandles });
  const [loading, setLoading] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  // A slow request for an abandoned range must not overwrite the current one.
  const latest = useRef(DEFAULT_CANDLE_RANGE);

  const select = useCallback(
    async (nextId: string) => {
      latest.current = nextId;
      setRangeId(nextId);
      setFailed(null);
      if (cache[nextId]) return;

      setLoading(nextId);
      try {
        // handler, not a venue. The upstream call happens server-side inside
        // it, which is exactly where the adapter rule wants it.
        const res = await fetch(
          `/api/candles?asset=${encodeURIComponent(assetId)}&range=${encodeURIComponent(nextId)}`,
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { candles: Candle[] };
        if (latest.current !== nextId) return;
        setCache((prev) => ({ ...prev, [nextId]: data.candles }));
      } catch {
        if (latest.current === nextId) setFailed(nextId);
      } finally {
        if (latest.current === nextId) setLoading(null);
      }
    },
    [assetId, cache],
  );

  useEffect(() => {
    latest.current = rangeId;
  }, [rangeId]);

  // Keep the previous chart on screen while the next range loads.
  const shown = cache[rangeId] ?? cache[DEFAULT_CANDLE_RANGE] ?? [];
  const change = seriesChange(shown);
  const direction: Direction = change?.direction ?? 'flat';

  const active = CANDLE_RANGES.find((r) => r.id === rangeId);
  const isEmpty = (cache[rangeId]?.length ?? 0) === 0 && !loading && cache[rangeId] !== undefined;

  return (
    <>
      <div className="mr-chart-head">
        <div className="mr-range" role="group" aria-label="Chart range">
          {CANDLE_RANGES.map((range) => (
            <button
              key={range.id}
              type="button"
              className="mr-range-btn"
              aria-pressed={rangeId === range.id}
              onClick={() => select(range.id)}
            >
              {range.label}
              <span className="sr-only"> — {range.description}</span>
            </button>
          ))}
        </div>

        {/* Status sits beside the control rather than over the chart, so the
            chart never blinks out while a range loads. */}
        <span className="mr-chart-status" aria-live="polite">
          {loading
            ? 'Loading…'
            : failed === rangeId
              ? 'Could not load that range'
              : active
                ? `${shown.length} bars · ${active.description.toLowerCase()}`
                : null}
        </span>
      </div>

      {isEmpty ? (
        <p className="mr-chart-empty">
          No price history for this range. The market may be newer than the window.
        </p>
      ) : (
        <CandleChart candles={shown} direction={direction} />
      )}
    </>
  );
}
