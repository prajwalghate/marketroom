import type { ReactNode } from 'react';
import { dataColor, svgId } from './palette';

/**
 * Server-rendered charts: sparklines with a gradient fill, pies and donuts
 * with labels and a legend, horizontal bars, a gauge and a split bar.
 *
 * Every chart is an SVG with a text alternative — a legend with the numbers
 * on screen, and a table for screen readers — so nothing depends on seeing a
 * colour or hovering a shape.
 */

type Tone = 'up' | 'down' | 'flat' | 'accent';

const toneVar: Record<Tone, string> = {
  up: 'var(--mr-up)',
  down: 'var(--mr-down)',
  flat: 'var(--mr-flat)',
  accent: 'var(--mr-accent)',
};

// ---------------------------------------------------------------------------
// Sparkline with a gradient area
// ---------------------------------------------------------------------------

export function AreaSpark({
  values,
  width = 150,
  height = 48,
  tone,
  label,
}: {
  values: readonly number[];
  width?: number;
  height?: number;
  /** Defaults to the direction of the series. */
  tone?: Tone;
  label?: string;
}) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return <span className="rx-spark-empty" style={{ width, height }} />;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const step = width / (clean.length - 1);
  const pts = clean.map(
    (v, i) => [i * step, height - 3 - ((v - min) / span) * (height - 8)] as const,
  );
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const resolved: Tone = tone ?? (clean[clean.length - 1]! >= clean[0]! ? 'up' : 'down');
  const color = toneVar[resolved];
  const id = svgId(
    'spark',
    `${label ?? ''}${clean.length}${clean[0]}${clean[clean.length - 1]}${resolved}`,
  );
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="rx-areaspark"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${line} ${width},${height}`} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pie and donut
// ---------------------------------------------------------------------------

export interface Slice {
  readonly label: string;
  readonly value: number;
  /** Defaults to the palette in order. */
  readonly color?: string;
  readonly href?: string;
}

function arcPath(cx: number, cy: number, r: number, inner: number, a0: number, a1: number): string {
  // A full circle cannot be drawn as one arc; nudge the end.
  const end = a1 - a0 >= Math.PI * 2 ? a0 + Math.PI * 2 - 0.0001 : a1;
  const large = end - a0 > Math.PI ? 1 : 0;
  const p = (radius: number, a: number) =>
    [cx + radius * Math.sin(a), cy - radius * Math.cos(a)] as const;
  const [x0, y0] = p(r, a0);
  const [x1, y1] = p(r, end);
  if (inner <= 0) {
    return `M${cx},${cy} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`;
  }
  const [i0x, i0y] = p(inner, end);
  const [i1x, i1y] = p(inner, a0);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} L${i0x.toFixed(2)},${i0y.toFixed(2)} A${inner},${inner} 0 ${large} 0 ${i1x.toFixed(2)},${i1y.toFixed(2)} Z`;
}

/**
 * A pie (or, with `inner`, a donut) with percentage labels outside the larger
 * slices and a legend beside it. Small slices beyond `max` fold into "Other".
 */
export function PieChart({
  slices,
  label,
  size = 220,
  inner = 0,
  center,
  max = 8,
  format = (v) => v.toLocaleString('en-US'),
  legendValue,
}: {
  slices: readonly Slice[];
  label: string;
  size?: number;
  /** Inner radius as a fraction of the radius, for a donut. */
  inner?: number;
  center?: { value: ReactNode; caption?: string };
  max?: number;
  format?: (v: number) => string;
  /** How to show a value in the legend; defaults to the formatted value. */
  legendValue?: (s: Slice, share: number) => ReactNode;
}) {
  const positive = slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const head = positive.slice(0, max - (positive.length > max ? 1 : 0));
  const rest = positive.slice(head.length);
  const shown: Slice[] = rest.length
    ? [
        ...head,
        {
          label: `Other (${rest.length})`,
          value: rest.reduce((s, x) => s + x.value, 0),
          color: 'var(--mr-flat)',
        },
      ]
    : head;
  const total = shown.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return <p className="rx-empty">Nothing to chart yet.</p>;

  const pad = inner > 0 ? 6 : 34;
  const box = size + pad * 2;
  const cx = box / 2;
  const cy = box / 2;
  const r = size / 2;
  let angle = 0;
  const arcs = shown.map((s, i) => {
    const a0 = angle;
    const a1 = angle + (s.value / total) * Math.PI * 2;
    angle = a1;
    return { ...s, color: s.color ?? dataColor(i), a0, a1, share: s.value / total };
  });

  return (
    <figure className="rx-pie">
      <svg
        viewBox={`0 0 ${box} ${box}`}
        width={box}
        height={box}
        className="rx-pie-svg"
        role="img"
        aria-label={label}
      >
        {arcs.map((a) => (
          <path
            key={a.label}
            d={arcPath(cx, cy, r, inner * r, a.a0, a.a1)}
            fill={a.color}
            className="rx-pie-slice"
          >
            <title>{`${a.label}: ${format(a.value)} (${(a.share * 100).toFixed(1)}%)`}</title>
          </path>
        ))}
        {inner <= 0 &&
          arcs
            .filter((a) => a.share >= 0.025)
            .map((a) => {
              const mid = (a.a0 + a.a1) / 2;
              const lx = cx + (r + 14) * Math.sin(mid);
              const ly = cy - (r + 14) * Math.cos(mid);
              return (
                <text
                  key={`l-${a.label}`}
                  x={lx}
                  y={ly}
                  className="rx-pie-pct"
                  textAnchor={Math.sin(mid) >= 0 ? 'start' : 'end'}
                  dominantBaseline="middle"
                  aria-hidden="true"
                >
                  {(a.share * 100).toFixed(a.share >= 0.1 ? 0 : 1)}%
                </text>
              );
            })}
        {center && (
          <>
            <text
              x={cx}
              y={cy - 4}
              textAnchor="middle"
              className="rx-pie-center"
              aria-hidden="true"
            >
              {center.value}
            </text>
            {center.caption && (
              <text
                x={cx}
                y={cy + 16}
                textAnchor="middle"
                className="rx-pie-caption"
                aria-hidden="true"
              >
                {center.caption}
              </text>
            )}
          </>
        )}
      </svg>
      <figcaption className="rx-legend">
        <ul>
          {arcs.map((a) => (
            <li key={a.label}>
              <span className="rx-legend-dot" style={{ background: a.color }} aria-hidden="true" />
              {a.href ? (
                <a href={a.href} className="rx-legend-label">
                  {a.label}
                </a>
              ) : (
                <span className="rx-legend-label">{a.label}</span>
              )}
              <span className="rx-legend-value mr-num">
                {legendValue ? legendValue(a, a.share) : format(a.value)}
              </span>
            </li>
          ))}
        </ul>
      </figcaption>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {arcs.map((a) => (
            <tr key={a.label}>
              <th scope="row">{a.label}</th>
              <td>
                {format(a.value)} ({(a.share * 100).toFixed(1)}%)
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bars, optionally stacked
// ---------------------------------------------------------------------------

export interface BarRow {
  readonly label: string;
  readonly href?: string;
  readonly segments: readonly { value: number; key: string }[];
}

export function HBarChart({
  rows,
  series,
  label,
  format = (v) => v.toLocaleString('en-US'),
}: {
  rows: readonly BarRow[];
  series: readonly { key: string; label: string; color?: string }[];
  label: string;
  format?: (v: number) => string;
}) {
  const totals = rows.map((r) => r.segments.reduce((s, x) => s + x.value, 0));
  const max = Math.max(1, ...totals);
  const colorOf = (key: string) =>
    series.find((s) => s.key === key)?.color ?? dataColor(series.findIndex((s) => s.key === key));
  return (
    <figure className="rx-hbars" aria-label={label}>
      {series.length > 1 && (
        <ul className="rx-legend is-row" aria-hidden="true">
          {series.map((s) => (
            <li key={s.key}>
              <span className="rx-legend-dot" style={{ background: colorOf(s.key) }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <ul className="rx-hbars-list" aria-hidden="true">
        {rows.map((r, i) => (
          <li key={r.label}>
            <span className="rx-hbars-label">
              {r.href ? <a href={r.href}>{r.label}</a> : r.label}
            </span>
            <span className="rx-hbars-track">
              {r.segments
                .filter((s) => s.value > 0)
                .map((s) => (
                  <span
                    key={s.key}
                    className="rx-hbars-seg"
                    style={{ width: `${(s.value / max) * 100}%`, background: colorOf(s.key) }}
                    title={`${series.find((x) => x.key === s.key)?.label ?? s.key}: ${format(s.value)}`}
                  />
                ))}
            </span>
            <span className="rx-hbars-value mr-num">{format(totals[i]!)}</span>
          </li>
        ))}
      </ul>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Row</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              {series.map((s) => (
                <td key={s.key}>{format(r.segments.find((x) => x.key === s.key)?.value ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Gauge
// ---------------------------------------------------------------------------

/** A half-circle gauge from 0 to 100, coloured from down through warn to up. */
export function Gauge({
  value,
  label,
  caption,
}: {
  value: number;
  label: string;
  caption?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const w = 120;
  const h = 70;
  const cx = w / 2;
  const cy = 62;
  const r = 48;
  const seg = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from / 100);
    const a1 = Math.PI * (1 - to / 100);
    const p = (a: number) => [cx + r * Math.cos(a), cy - r * Math.sin(a)] as const;
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
  };
  const angle = Math.PI * (1 - v / 100);
  const mx = cx + r * Math.cos(angle);
  const my = cy - r * Math.sin(angle);
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={`${label}: ${Math.round(v)} of 100${caption ? `, ${caption}` : ''}`}
      className="rx-gauge"
    >
      <path d={seg(0, 24)} stroke="var(--mr-down)" />
      <path d={seg(26, 48)} stroke="var(--mr-warn)" />
      <path d={seg(52, 74)} stroke="var(--mr-data-1)" />
      <path d={seg(76, 100)} stroke="var(--mr-up)" />
      <circle cx={mx} cy={my} r={6} className="rx-gauge-knob" />
      {caption && (
        <text x={cx} y={cy - 4} textAnchor="middle" className="rx-gauge-caption">
          {caption}
        </text>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Split bar
// ---------------------------------------------------------------------------

/** One bar split in two — checked vs not yet, lead vs participant. */
export function SplitBar({
  parts,
  label,
}: {
  parts: readonly { label: string; value: number; color: string }[];
  label: string;
}) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <figure className="rx-split" aria-label={label}>
      <div className="rx-split-legend">
        {parts.map((p) => (
          <span key={p.label}>
            <span className="rx-legend-dot" style={{ background: p.color }} aria-hidden="true" />
            {p.label} <strong className="mr-num">{p.value.toLocaleString('en-US')}</strong>{' '}
            <span className="rx-muted mr-num">({((p.value / total) * 100).toFixed(1)}%)</span>
          </span>
        ))}
      </div>
      <div className="rx-split-bar" aria-hidden="true">
        {parts.map((p) => (
          <span
            key={p.label}
            style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
          />
        ))}
      </div>
    </figure>
  );
}
