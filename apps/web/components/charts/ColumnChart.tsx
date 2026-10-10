'use client';

import { formatCompactUsd } from '@marketroom/core';
import { useEffect, useId, useRef, useState } from 'react';
import { dataColor } from './palette';

/**
 * Stacked columns over time, with an optional line on its own axis — funding
 * by category per month, with the number of rounds drawn across it.
 *
 * Hovering or focusing a column shows its breakdown. The same numbers are in a
 * table for screen readers, so the tooltip is a convenience, never the only
 * way to read a value.
 */

export type ValueFormat = 'usd' | 'count';

const formatters: Record<ValueFormat, (v: number) => string> = {
  usd: (v) => formatCompactUsd(v),
  count: (v) => Math.round(v).toLocaleString('en-US'),
};

export interface ColumnSeries {
  readonly key: string;
  readonly label: string;
  readonly values: readonly number[];
}

export function ColumnChart({
  labels,
  series,
  line,
  format = 'usd',
  lineFormat = 'count',
  height = 260,
  label,
}: {
  labels: readonly string[];
  series: readonly ColumnSeries[];
  line?: { label: string; values: readonly number[] };
  format?: ValueFormat;
  lineFormat?: ValueFormat;
  height?: number;
  label: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [width, setWidth] = useState(760);
  const wrap = useRef<HTMLDivElement>(null);
  // Draw at the real width so axis text stays legible in a narrow column.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && Math.abs(w - width) > 1) setWidth(Math.round(w));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);
  const tipId = useId();
  const fmt = formatters[format];
  const lineFmt = formatters[lineFormat];

  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0));
  const peak = Math.max(format === 'count' ? 1 : 0.01, ...totals);
  const step = niceStep(peak / 4, format === 'count');
  const max = step * Math.ceil(peak / step);
  const linePeak = line ? Math.max(1, ...line.values) : 1;
  const lineStep = niceStep(linePeak / 2, lineFormat === 'count');
  const lineMax = lineStep * Math.ceil(linePeak / lineStep);
  const W = Math.max(240, width);
  const H = height;
  const left = 54;
  const right = line ? 40 : 12;
  const top = 12;
  const bottom = 26;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const band = plotW / Math.max(1, n);
  const barW = Math.max(3, Math.min(28, band * 0.62));
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const ly = (v: number) => top + plotH - (v / lineMax) * plotH;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const lineTicks = Array.from(
    { length: Math.round(lineMax / lineStep) + 1 },
    (_, i) => i * lineStep,
  );
  const labelEvery = Math.ceil(n / Math.max(2, Math.floor(plotW / 64)));

  return (
    <figure className="rx-colchart" aria-label={label}>
      <ul className="rx-legend is-row" aria-hidden="true">
        {series.map((s, i) => (
          <li key={s.key}>
            <span className="rx-legend-dot" style={{ background: dataColor(i) }} />
            {s.label}
          </li>
        ))}
        {line && (
          <li>
            <span className="rx-legend-line" />
            {line.label}
          </li>
        )}
      </ul>
      <div className="rx-colchart-wrap" ref={wrap} onMouseLeave={() => setActive(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="rx-colchart-svg"
          role="presentation"
          aria-hidden="true"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} className="rx-grid-line" />
              <text
                x={left - 8}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="rx-axis-text"
              >
                {fmt(t)}
              </text>
            </g>
          ))}
          {line &&
            lineTicks.map((t) => (
              <text
                key={t}
                x={W - right + 6}
                y={ly(t)}
                dominantBaseline="middle"
                className="rx-axis-text"
              >
                {lineFmt(t)}
              </text>
            ))}
          {labels.map((l, i) => {
            const cx = left + band * i + band / 2;
            let acc = 0;
            return (
              <g
                key={l}
                onMouseEnter={() => setActive(i)}
                className={active === i ? 'is-active' : undefined}
              >
                <rect
                  x={left + band * i}
                  y={top}
                  width={band}
                  height={plotH}
                  className="rx-col-hit"
                />
                {series.map((s, si) => {
                  const v = s.values[i] ?? 0;
                  if (v <= 0) return null;
                  const y0 = y(acc + v);
                  const h = y(acc) - y0;
                  acc += v;
                  return (
                    <rect
                      key={s.key}
                      x={cx - barW / 2}
                      y={y0}
                      width={barW}
                      height={Math.max(0.5, h)}
                      fill={dataColor(si)}
                      rx={si === series.length - 1 ? 2 : 0}
                    />
                  );
                })}
                {i % labelEvery === 0 && (
                  <text x={cx} y={H - 8} textAnchor="middle" className="rx-axis-text">
                    {l}
                  </text>
                )}
              </g>
            );
          })}
          {line && (
            <>
              <polyline
                points={line.values
                  .map((v, i) => `${left + band * i + band / 2},${ly(v)}`)
                  .join(' ')}
                className="rx-colchart-line"
              />
              {line.values.map((v, i) => (
                <circle
                  key={i}
                  cx={left + band * i + band / 2}
                  cy={ly(v)}
                  r={active === i ? 4 : 2.2}
                  className="rx-colchart-dot"
                />
              ))}
            </>
          )}
        </svg>
        {active !== null && (
          <div
            id={tipId}
            role="tooltip"
            className="rx-tooltip"
            style={{
              left: `${((left + band * active + band / 2) / W) * 100}%`,
            }}
          >
            <strong>{labels[active]}</strong>
            <span className="rx-tooltip-row">
              <span>Total</span>
              <span className="mr-num">{fmt(totals[active]!)}</span>
            </span>
            {series
              .map((s, si) => ({ s, si, v: s.values[active] ?? 0 }))
              .filter((x) => x.v > 0)
              .sort((a, b) => b.v - a.v)
              .map(({ s, si, v }) => (
                <span key={s.key} className="rx-tooltip-row">
                  <span>
                    <span
                      className="rx-legend-dot"
                      style={{ background: dataColor(si) }}
                      aria-hidden="true"
                    />{' '}
                    {s.label}
                  </span>
                  <span className="mr-num">{fmt(v)}</span>
                </span>
              ))}
            {line && (
              <span className="rx-tooltip-row">
                <span>{line.label}</span>
                <span className="mr-num">{lineFmt(line.values[active] ?? 0)}</span>
              </span>
            )}
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
            {line && <th scope="col">{line.label}</th>}
          </tr>
        </thead>
        <tbody>
          {labels.map((l, i) => (
            <tr key={l}>
              <th scope="row">{l}</th>
              {series.map((s) => (
                <td key={s.key}>{fmt(s.values[i] ?? 0)}</td>
              ))}
              {line && <td>{lineFmt(line.values[i] ?? 0)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** A tidy axis step near `raw`: 1, 2, 2.5 or 5 times a power of ten; whole for counts. */
function niceStep(raw: number, integer: boolean): number {
  const safe = raw > 0 ? raw : 1;
  const exp = Math.pow(10, Math.floor(Math.log10(safe)));
  const f = safe / exp;
  const nice = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
  return integer ? Math.max(1, Math.ceil(nice)) : nice;
}
