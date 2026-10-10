'use client';

import type { InstrumentKind, Side, Verdict, VenueId } from '@marketroom/core';
import {
  formatNotional,
  formatNotionalShort,
  formatPercentAdaptive,
  formatPrice,
  VERDICT_LABEL,
} from '@marketroom/core';
import { useEffect, useId, useRef, useState } from 'react';
import { seriesName } from './TrustBits';

/**
 * Price at size — the trust check as a picture.
 *
 * x is order size on a log scale, $100 to $100k. y is how far the fill lands
 * from the reference price. Each venue is a cone: buys above, sells below, and
 * the width of the cone is what a trade of that size costs. A deep market is a
 * sliver hugging zero; a dead one blows out to the edge of the chart.
 *
 * The y axis is a symmetric log scale, linear inside ±0.1% and logarithmic
 * beyond. On one asset the same chart has to show a perp filling $100k within
 * 0.07% and a token filling $1k at +222% — a linear axis would flatten the
 * first into the zero line, and clipping the second would hide exactly the
 * number the chart exists to show. Gridlines are labelled in plain percent so
 * the scale never has to be explained to be read.
 */

export interface CurvePoint {
  readonly side: Side;
  readonly notionalUsd: number;
  readonly price: number | null;
}

export interface CurveSeries {
  readonly listingId: string;
  readonly venue: VenueId;
  readonly kind: InstrumentKind;
  readonly verdict: Verdict;
  readonly points: readonly CurvePoint[];
}

const SIZES = [100, 1_000, 10_000, 100_000] as const;
const REFERENCE_INDEX = 2; // $10k: the size every verdict is stated against.

const LINEAR_BAND = 0.001;
const symlog = (d: number) => Math.sign(d) * Math.log10(1 + Math.abs(d) / LINEAR_BAND);
/** ±0.1% … ±10,000%, as fractions. */
const GRIDLINES = [0.001, 0.01, 0.1, 1, 10, 100];
const TOLERANCE = 0.01;

const VENUE_COLOR: Record<VenueId, string> = {
  hyperliquid: 'var(--mr-venue-hyperliquid)',
  solana: 'var(--mr-venue-solana)',
};

const gridLabel = (fraction: number) =>
  `${(fraction * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;

export function FillCurve({
  series,
  anchor,
}: {
  series: readonly CurveSeries[];
  anchor: { readonly price: number; readonly label: string };
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [active, setActive] = useState(REFERENCE_INDEX);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const compact = width < 520;
  const height = compact ? 240 : 290;
  const pad = { left: compact ? 50 : 62, right: compact ? 12 : 22, top: 16, bottom: 30 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const deviation = (price: number) => price / anchor.price - 1;

  // Extents grow to the furthest point, and never shrink inside ±1%: the
  // tradable band is the frame every cone is read against.
  let top = symlog(TOLERANCE);
  let bottom = -symlog(TOLERANCE);
  for (const s of series) {
    for (const p of s.points) {
      if (p.price === null) continue;
      const v = symlog(deviation(p.price));
      top = Math.max(top, v);
      bottom = Math.min(bottom, v);
    }
  }
  const snap = (v: number) => {
    for (const g of GRIDLINES) if (symlog(g) >= Math.abs(v) - 1e-9) return symlog(g);
    return Math.abs(v);
  };
  top = snap(top) * 1.06;
  bottom = -snap(bottom) * 1.06;

  const x = (size: number) => pad.left + ((Math.log10(size) - 2) / 3) * plotW;
  const y = (v: number) => pad.top + ((top - v) / (top - bottom)) * plotH;
  const yOf = (price: number) => y(symlog(deviation(price)));

  const band = { top: y(symlog(TOLERANCE)), bottom: y(-symlog(TOLERANCE)) };

  // Labels are placed by importance — the ±1% band edges first, the finest
  // gridlines last — and any that would sit within 13px of one already placed
  // is dropped. On a chart spanning 0.01% to 10,000%, the ±0.1% lines are a
  // few pixels from zero and would otherwise print on top of it.
  const gridlines: { signed: number; gy: number }[] = [];
  const placed = [y(0)];
  for (const g of [0.01, 0.1, 1, 10, 100, 0.001]) {
    for (const signed of [g, -g]) {
      const v = symlog(signed);
      if (v > top || v < bottom) continue;
      const gy = y(v);
      if (placed.some((p) => Math.abs(p - gy) < 13)) continue;
      placed.push(gy);
      gridlines.push({ signed, gy });
    }
  }
  const activeSize = SIZES[active]!;

  const cones = series.map((s) => {
    const side = (which: Side) =>
      s.points
        .filter((p) => p.side === which && p.price !== null)
        .sort((a, b) => a.notionalUsd - b.notionalUsd)
        .map((p) => [x(p.notionalUsd), yOf(p.price!)] as const);
    const buys = side('buy');
    const sells = side('sell');
    const outline = [...buys, ...[...sells].reverse()];
    return {
      s,
      buys,
      sells,
      area:
        buys.length > 0 && sells.length > 0
          ? `M${outline.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join('L')}Z`
          : null,
      missing: s.points.filter((p) => p.price === null),
    };
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowLeft') setActive((i) => Math.max(0, i - 1));
    else if (event.key === 'ArrowRight') setActive((i) => Math.min(SIZES.length - 1, i + 1));
    else if (event.key === 'Home') setActive(0);
    else if (event.key === 'End') setActive(SIZES.length - 1);
    else return;
    event.preventDefault();
  };

  const onPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    SIZES.forEach((size, i) => {
      if (Math.abs(x(size) - px) < Math.abs(x(SIZES[nearest]!) - px)) nearest = i;
    });
    setActive(nearest);
  };

  return (
    <figure className="mr-fc">
      <div ref={wrapRef} className="mr-fc-plot">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-labelledby={`${titleId} ${descId}`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerMove={onPointer}
          className="mr-fc-svg"
        >
          {/* One string child each. React 19 treats <title> as document
              metadata and expects a single text node; mixed children render
              differently on the server and the client and break hydration. */}
          <title id={titleId}>{`Fill price by order size, against the ${anchor.label}`}</title>
          <desc id={descId}>
            {`${series
              .map((s) => `${seriesName(s.venue, s.kind)}: ${VERDICT_LABEL[s.verdict]}.`)
              .join(' ')} Use the left and right arrow keys to read each order size.`}
          </desc>

          {/* The tradable band: within 1% of the reference. */}
          <rect
            x={pad.left}
            y={band.top}
            width={plotW}
            height={Math.max(0, band.bottom - band.top)}
            fill="var(--mr-up-soft)"
          />

          {gridlines.map(({ signed, gy }) => {
            return (
              <g key={signed}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={gy}
                  y2={gy}
                  stroke="var(--mr-border-subtle)"
                />
                <text x={pad.left - 8} y={gy + 3.5} textAnchor="end" className="mr-fc-tick">
                  {`${signed > 0 ? '+' : '−'}${gridLabel(Math.abs(signed))}`}
                </text>
              </g>
            );
          })}

          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(0)}
            y2={y(0)}
            stroke="var(--mr-border-strong)"
          />
          <text x={pad.left - 8} y={y(0) + 3.5} textAnchor="end" className="mr-fc-tick">
            0
          </text>

          {SIZES.map((size, i) => (
            <g key={size}>
              <line
                x1={x(size)}
                x2={x(size)}
                y1={pad.top}
                y2={height - pad.bottom}
                stroke={i === active ? 'var(--mr-border-strong)' : 'var(--mr-border-subtle)'}
                strokeDasharray={i === active ? undefined : '2 4'}
              />
              <text
                x={x(size)}
                y={height - pad.bottom + 18}
                textAnchor={i === 0 ? 'start' : i === SIZES.length - 1 ? 'end' : 'middle'}
                className={i === active ? 'mr-fc-tick is-active' : 'mr-fc-tick'}
              >
                {formatNotionalShort(size)}
              </text>
            </g>
          ))}

          {cones.map(({ s, area, buys, sells, missing }) => {
            const color = VENUE_COLOR[s.venue];
            const line = (pts: readonly (readonly [number, number])[]) =>
              pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
            return (
              <g key={s.listingId}>
                {area && <path d={area} fill={color} fillOpacity={0.16} />}
                {buys.length > 1 && (
                  <polyline points={line(buys)} fill="none" stroke={color} strokeWidth={2} />
                )}
                {sells.length > 1 && (
                  <polyline
                    points={line(sells)}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray="5 3"
                  />
                )}
                {[...buys, ...sells].map(([px, py], i) => (
                  <circle
                    key={i}
                    cx={px}
                    cy={py}
                    r={3}
                    fill="var(--mr-surface-1)"
                    stroke={color}
                    strokeWidth={1.75}
                  />
                ))}
                {missing.map((p) => (
                  <text
                    key={`${p.side}-${p.notionalUsd}`}
                    x={x(p.notionalUsd)}
                    y={p.side === 'buy' ? pad.top + 10 : height - pad.bottom - 4}
                    textAnchor="middle"
                    className="mr-fc-miss"
                    fill={color}
                  >
                    ×
                  </text>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      {/* The readout is the chart in words: every number it draws, for the
          size under the cursor (or the focused size, from the keyboard). It
          defaults to $10k because that is the size the verdicts quote. */}
      <figcaption className="mr-fc-readout" aria-live="polite">
        <span className="mr-fc-readout-size">
          {formatNotional(activeSize)} order
          {active === REFERENCE_INDEX && <span className="mr-fc-ref"> · reference size</span>}
        </span>
        {series.map((s) => {
          const at = (side: Side) =>
            s.points.find((p) => p.side === side && p.notionalUsd === activeSize)?.price ?? null;
          const cell = (side: Side) => {
            const price = at(side);
            if (price === null) return <span className="mr-fc-none">no fill</span>;
            const d = deviation(price);
            return (
              <span className="mr-num">
                {formatPrice(price)}{' '}
                <span className={Math.abs(d) > TOLERANCE ? 'mr-fc-dev is-wide' : 'mr-fc-dev'}>
                  {formatPercentAdaptive(d, { signed: true })}
                </span>
              </span>
            );
          };
          return (
            <span key={s.listingId} className="mr-fc-row">
              <span className="mr-fc-swatch" style={{ background: VENUE_COLOR[s.venue] }} />
              <span className="mr-fc-name">{seriesName(s.venue, s.kind)}</span>
              <span className="mr-fc-side">buy</span>
              {cell('buy')}
              <span className="mr-fc-side">sell</span>
              {cell('sell')}
            </span>
          );
        })}
        <span className="mr-fc-key">
          Solid line: buys. Dashed: sells. Shaded band: within 1% of the {anchor.label} (
          {formatPrice(anchor.price)}). × marks a size that could not be filled.
        </span>
      </figcaption>
    </figure>
  );
}
