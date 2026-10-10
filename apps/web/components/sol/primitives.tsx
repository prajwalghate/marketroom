import type { SeriesPoint } from '@marketroom/core';
import { formatPercentAdaptive } from '@marketroom/core';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Avatar } from './Avatar';

/**
 * Shared building blocks for the research pages. Server-safe: nothing here
 * holds state. Colour comes from tokens only; data carries the hue.
 */

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/** A signed change, coloured by direction, with the sign doing the work for colour-blind readers. */
export function Delta({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className="rx-muted">—</span>;
  }
  const cls = value > 0 ? 'rx-up' : value < 0 ? 'rx-down' : 'rx-muted';
  return <span className={`mr-num ${cls}`}>{formatPercentAdaptive(value, { signed: true })}</span>;
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

/** A sparkline over plain values. Rises draw in the up colour, falls in the down colour. */
export function MiniLine({
  values,
  width = 96,
  height = 28,
  label,
}: {
  values: readonly number[];
  width?: number;
  height?: number;
  label?: string;
}) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return <span className="rx-spark-empty" style={{ width, height }} />;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const step = width / (clean.length - 1);
  const points = clean
    .map(
      (v, i) =>
        `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`,
    )
    .join(' ');
  const rising = clean[clean.length - 1]! >= clean[0]!;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="rx-spark"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <polyline
        points={points}
        fill="none"
        stroke={rising ? 'var(--mr-up)' : 'var(--mr-down)'}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** An area chart over a dated series, for TVL and supply history. */
export function AreaChart({
  series,
  height = 180,
  label,
  format,
}: {
  series: readonly SeriesPoint[];
  height?: number;
  label: string;
  format: (v: number) => string;
}) {
  const width = 720;
  const pts = series.filter((p) => Number.isFinite(p.v));
  if (pts.length < 2) return <p className="rx-empty">No history recorded.</p>;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const lo = min - (max - min) * 0.05;
  const span = max - lo || 1;
  const t0 = pts[0]!.t;
  const tSpan = pts[pts.length - 1]!.t - t0 || 1;
  const x = (t: number) => ((t - t0) / tSpan) * width;
  const y = (v: number) => height - ((v - lo) / span) * (height - 8) - 4;
  const line = pts.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1]!;
  const first = pts[0]!;
  const dateFmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <figure className="rx-area">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="rx-area-svg"
        role="img"
        aria-label={`${label}: ${format(first.v)} on ${dateFmt.format(first.t)}, ${format(last.v)} now`}
      >
        <polygon points={`0,${height} ${line} ${width},${height}`} fill="var(--mr-accent-muted)" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--mr-accent)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="rx-area-axis">
        <span>{dateFmt.format(first.t)}</span>
        <span className="mr-num">
          {format(min)} – {format(max)}
        </span>
        <span>{dateFmt.format(last.t)}</span>
      </figcaption>
    </figure>
  );
}

/** Vertical bars with labels — monthly funding, deals per year. */
export function Bars({
  data,
  format,
  label,
  height = 140,
}: {
  data: readonly { label: string; value: number; note?: string }[];
  format: (v: number) => string;
  label: string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className="rx-bars" aria-label={label}>
      <div className="rx-bars-plot" style={{ height }}>
        {data.map((d) => (
          <div
            key={d.label}
            className="rx-bar-col"
            title={`${d.label}: ${format(d.value)}${d.note ? ` · ${d.note}` : ''}`}
          >
            <div
              className="rx-bar"
              style={{ height: `${Math.max(d.value > 0 ? 2 : 0, (d.value / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="rx-bars-axis" aria-hidden="true">
        {data.map((d, i) => (
          <span key={d.label}>{i % Math.ceil(data.length / 8) === 0 ? d.label : ''}</span>
        ))}
      </div>
      {/* The chart in words, for anyone not reading bars. */}
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>
                {format(d.value)}
                {d.note ? ` (${d.note})` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** A horizontal share bar, for a breakdown row. */
export function ShareBar({ fraction }: { fraction: number }) {
  return (
    <span className="rx-share" aria-hidden="true">
      <span style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function PageHead({
  title,
  lead,
  meta,
  children,
}: {
  title: string;
  lead?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="rx-page-head">
      <div>
        <h1 className="rx-title">{title}</h1>
        {lead && <p className="rx-lead">{lead}</p>}
      </div>
      {meta && <div className="rx-page-meta">{meta}</div>}
      {children}
    </header>
  );
}

export function Panel({
  title,
  action,
  children,
  id,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="rx-panel" aria-labelledby={id ? `${id}-h` : undefined} id={id}>
      <header className="rx-panel-head">
        <h2 className="rx-panel-title" id={id ? `${id}-h` : undefined}>
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  sub,
  chart,
  hint,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  chart?: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rx-kpi">
      <dt className="rx-kpi-label" title={hint}>
        {label}
      </dt>
      <dd className="rx-kpi-body">
        <span className="rx-kpi-value mr-num">{value}</span>
        {sub && <span className="rx-kpi-sub">{sub}</span>}
        {chart && <span className="rx-kpi-chart">{chart}</span>}
      </dd>
    </div>
  );
}

export function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="rx-more" prefetch>
      {children} <span aria-hidden="true">→</span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export function ProjectCell({
  slug,
  name,
  logo,
  symbol,
}: {
  slug: string;
  name: string;
  logo: string | null;
  symbol?: string | null;
}) {
  return (
    <Link href={`/projects/${slug}`} className="rx-entity" prefetch={false}>
      <Avatar src={logo} name={name} size={24} />
      <span className="rx-entity-name">{name}</span>
      {symbol && <span className="rx-entity-sym mr-num">{symbol}</span>}
    </Link>
  );
}

export function InvestorChip({ slug, name, lead }: { slug: string; name: string; lead?: boolean }) {
  return (
    <Link
      href={`/investors/${slug}`}
      className={lead ? 'rx-chip is-lead' : 'rx-chip'}
      prefetch={false}
    >
      <Avatar src={null} name={name} size={18} />
      <span>{name}</span>
      {lead && <span className="rx-chip-tag">Lead</span>}
    </Link>
  );
}

export function Tag({ children, href }: { children: ReactNode; href?: string }) {
  return href ? (
    <Link href={href} className="rx-tag" prefetch={false}>
      {children}
    </Link>
  ) : (
    <span className="rx-tag">{children}</span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rx-empty">{children}</p>;
}
