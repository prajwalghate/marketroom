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
 * so it carries `aria-hidden`. If you ever render one of these *without* the
 * number beside it, that is a bug: there is then no accessible path to the
 * information at all.
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

/**
 * Stable per-series id for the gradient.
 *
 * A constant id would collide the moment two filled sparklines share a
 * direction: duplicate DOM ids are invalid, and every `url(#id)` in the document
 * silently resolves to whichever one the browser parsed first. Hashing the path
 * keeps the id unique per shape and identical between server and client, so
 * hydration still matches. (`useId` would be the idiomatic answer but it is a
 * client hook, and this component has to render inside Server Components.)
 */
function gradientIdFor(path: string, direction: Direction): string {
  let hash = 0;
  for (let index = 0; index < path.length; index += 1) {
    hash = (hash * 31 + path.charCodeAt(index)) | 0;
  }
  return `mr-spark-${direction}-${(hash >>> 0).toString(36)}`;
}

export function Sparkline({
  candles,
  width = 88,
  height = 28,
  direction,
  filled = false,
  strokeWidth = 1.25,
}: SparklineProps) {
  // One point is not a trend, so there is nothing honest to draw. Reserve
  // exactly the same box — same element, same viewBox, same `display: block` —
  // so a row with no history is the same height as a row with history. An
  // inline <svg> here would pick up a baseline gap and shift the row.
  if (candles.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        focusable="false"
        style={{ display: 'block' }}
      />
    );
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
  const gradientId = gradientIdFor(line, resolved);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
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
