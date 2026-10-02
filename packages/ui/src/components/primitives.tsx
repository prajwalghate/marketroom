import type { InstrumentKind, VenueId } from '@marketroom/core';
import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Shared presentational primitives.
 *
 * Styles are written as inline token references rather than utility classes so
 * these stay portable and so the token contract is visible at the point of use.
 * No component here names a raw colour — every value resolves to a `--mr-*`
 * token from `tokens.css`.
 */

// ---------------------------------------------------------------------------
// Surface
// ---------------------------------------------------------------------------

export interface SurfaceProps {
  children: ReactNode;
  level?: 1 | 2 | 3;
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Surface({ children, level = 1, interactive, className, style }: SurfaceProps) {
  const background = `var(--mr-surface-${level})`;
  return (
    <div
      className={clsx(className, interactive && 'mr-interactive')}
      style={{
        background,
        border: '1px solid var(--mr-border)',
        borderRadius: 'var(--mr-radius-lg)',
        transition: `border-color var(--mr-duration) var(--mr-ease), background var(--mr-duration) var(--mr-ease)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

export type BadgeTone = 'neutral' | 'accent' | 'up' | 'down' | 'warn';

const BADGE_TONES: Record<BadgeTone, { fg: string; bg: string; border: string }> = {
  neutral: { fg: 'var(--mr-text-muted)', bg: 'var(--mr-surface-3)', border: 'var(--mr-border)' },
  accent: {
    fg: 'var(--mr-accent)',
    bg: 'var(--mr-accent-muted)',
    border: 'var(--mr-accent-border)',
  },
  up: { fg: 'var(--mr-up)', bg: 'var(--mr-up-soft)', border: 'var(--mr-up-border)' },
  down: { fg: 'var(--mr-down)', bg: 'var(--mr-down-soft)', border: 'var(--mr-down-border)' },
  warn: { fg: 'var(--mr-warn)', bg: 'var(--mr-warn-soft)', border: 'transparent' },
};

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  mono?: boolean;
  title?: string;
  className?: string;
}

export function Badge({ children, tone = 'neutral', mono, title, className }: BadgeProps) {
  const palette = BADGE_TONES[tone];
  return (
    <span
      title={title}
      className={clsx(mono && 'mr-num', className)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35em',
        padding: '2px 7px',
        fontSize: 'var(--mr-text-2xs)',
        fontWeight: 500,
        letterSpacing: '0.02em',
        color: palette.fg,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 'var(--mr-radius-sm)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Venue badge
// ---------------------------------------------------------------------------

const VENUE_META: Record<VenueId, { label: string; color: string }> = {
  hyperliquid: { label: 'Hyperliquid', color: 'var(--mr-venue-hyperliquid)' },
  solana: { label: 'Solana', color: 'var(--mr-venue-solana)' },
};

export function VenueBadge({ venue, compact }: { venue: VenueId; compact?: boolean }) {
  const meta = VENUE_META[venue];
  return (
    <span
      title={meta.label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4em',
        fontSize: 'var(--mr-text-2xs)',
        color: 'var(--mr-text-muted)',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: 'var(--mr-radius-full)',
          background: meta.color,
          flexShrink: 0,
        }}
      />
      {!compact && meta.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Instrument kind
// ---------------------------------------------------------------------------

/**
 * The product's central distinction, made visible.
 *
 * A perp and a custody-backed token can share a ticker and be completely
 * different products. Labelling the instrument everywhere a price appears is a
 * correctness requirement, not decoration.
 */
const KIND_LABELS: Record<InstrumentKind, { short: string; title: string }> = {
  perpetual: {
    short: 'PERP',
    title: 'Perpetual future — leveraged price exposure. No ownership, dividends or voting rights.',
  },
  'tokenized-equity': {
    short: 'TOKEN',
    title: 'Custody-backed token — redeemable claim on a real share held by the issuer.',
  },
  spot: { short: 'SPOT', title: 'Spot market.' },
};

export function InstrumentBadge({ kind }: { kind: InstrumentKind }) {
  const meta = KIND_LABELS[kind];
  return (
    <Badge tone={kind === 'perpetual' ? 'warn' : 'neutral'} mono title={meta.title}>
      {meta.short}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Stat
// ---------------------------------------------------------------------------

export interface StatProps {
  label: string;
  value: ReactNode;
  hint?: string;
  align?: 'left' | 'right';
}

export function Stat({ label, value, hint, align = 'left' }: StatProps) {
  return (
    <div style={{ textAlign: align, minWidth: 0 }}>
      <div
        style={{
          fontSize: 'var(--mr-text-2xs)',
          color: 'var(--mr-text-subtle)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 3,
          whiteSpace: 'nowrap',
        }}
        title={hint}
      >
        {label}
      </div>
      <div style={{ fontSize: 'var(--mr-text-sm)', color: 'var(--mr-text)', fontWeight: 500 }}>
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section heading
// ---------------------------------------------------------------------------

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 12,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 'var(--mr-text-xs)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--mr-text-subtle)',
        }}
      >
        {children}
      </h2>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        color: 'var(--mr-text-muted)',
        border: '1px dashed var(--mr-border)',
        borderRadius: 'var(--mr-radius-lg)',
      }}
    >
      <div style={{ fontSize: 'var(--mr-text-md)', color: 'var(--mr-text)', marginBottom: 6 }}>
        {title}
      </div>
      {hint && <div style={{ fontSize: 'var(--mr-text-sm)' }}>{hint}</div>}
    </div>
  );
}
