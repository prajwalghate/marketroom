import type { Candle, Direction } from '@marketroom/core';
import { normalizeCloses, seriesChange } from '@marketroom/core';

/**
 * Inline SVG sparkline.
 *
 * Hand-rolled rather than pulled from a charting library: at this size a chart
 * library's axes, tooltips and responsive machinery are pure overhead, and a
 * table may render a hundred of these at once. This is ~40 lines and allocates
 * one path string.
 *
 * Decorative by definition — the numeric change is always displayed next to it,
 * so it carries `aria-hidden`.
 */

export interface SparklineProps {
  candles: readonly Candle[];
  width?: number;
  height?: number;
  /** Override the colour. Defaults to the series' own direction. */
  direction?: Direction;
  /** Soft fill under the line. Off in dense tables. */
  filled?: boolean;
  strokeWidth?: number;
}

const COLOR: Record<Direction, string> = {
  up: 'var(--mr-up)',
  down: 'var(--mr-down)',
  flat: 'var(--mr-flat)',
};

export function Sparkline({
  candles,
  width = 88,
  height = 28,
  direction,
  filled = false,
  strokeWidth = 1.25,
}: SparklineProps) {
  if (candles.length < 2) {
    // Reserve the same space so a missing sparkline never shifts the layout.
    return <svg width={width} height={height} aria-hidden="true" />;
  }

  const normalized = normalizeCloses(candles);
  const resolved = direction ?? seriesChange(candles)?.direction ?? 'flat';
  const color = COLOR[resolved];

  // Inset by the stroke so the line is never clipped at the extremes.
  const pad = strokeWidth;
  const stepX = width / (normalized.length - 1);
  const usableHeight = height - pad * 2;

  const points = normalized.map((value, index) => {
    const x = index * stepX;
    const y = pad + (1 - value) * usableHeight; // SVG y grows downward.
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const line = `M${points.join(' L')}`;
  const area = `${line} L${width},${height} L0,${height} Z`;
  const gradientId = `mr-spark-${resolved}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {filled && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
        </>
      )}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
