import type { InstrumentKind, VenueId } from '@marketroom/core';
import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';
import { Tooltip } from './Tooltip';
import { VisuallyHidden } from './VisuallyHidden';

/**
 * Shared presentational primitives.
 *
 * Styles are written as inline token references rather than utility classes so
 * these stay portable and so the token contract is visible at the point of use.
 * No component here names a raw colour — every value resolves to a `--mr-*`
 * token from `tokens.css`.
 *
 * The one exception is `Surface`, whose background and border go through custom
 * properties instead. That is not stylistic: a CSS class can never override an
 * inline `background`, so hover and active states for an interactive card are
 * impossible unless the value is indirected through a variable.
 */

// ---------------------------------------------------------------------------
// Surface
// ---------------------------------------------------------------------------

export interface SurfaceProps {
  children: ReactNode;
  level?: 1 | 2 | 3;
  /**
   * Adds hover, active and `:focus-within` states. Use when the card is a hit
   * target — typically because it wraps a link. A Surface is a `<div>`, so it is
   * never itself focusable; `:focus-within` is what makes the card agree with
   * the focus ring of the link inside it.
   */
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Surface({ children, level = 1, interactive, className, style }: SurfaceProps) {
  return (
    <div
      className={clsx('mr-surface', interactive && 'mr-interactive', className)}
      style={
        {
          '--mr-surface-bg': `var(--mr-surface-${level})`,
          ...style,
        } as CSSProperties
      }
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
  /**
   * Explanation of an abbreviated label.
   *
   * This stays a native `title` rather than a `<Tooltip>` on purpose: badges are
   * routinely rendered *inside* a table-row link, and `<Tooltip>` adds a tab
   * stop, which would nest interactive content inside interactive content. The
   * text is also emitted visually-hidden, so keyboard and screen-reader users
   * get it even though the native tooltip never reaches them. Where a badge is
   * not inside a link, wrap it in `<Tooltip>` instead and leave this unset.
   */
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
        // Pinned so a badge is the same height whatever is inside it — a mono
        // digit and a capital letter have different natural line boxes.
        lineHeight: 1.45,
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
      {title && <VisuallyHidden>{` — ${title}`}</VisuallyHidden>}
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

/**
 * Which venue a listing came from.
 *
 * `compact` drops the label down to the dot alone, which is how the market
 * table's Venues column fits. The dot is `aria-hidden` decoration, so compact
 * mode has to supply the name some other way or the column is simply blank to a
 * screen reader — hence the visually-hidden label. A 6px coloured circle is also
 * invisible to a colour-blind user as an *identifier*, so the text is the real
 * answer and the dot is the shorthand.
 */
export function VenueBadge({ venue, compact }: { venue: VenueId; compact?: boolean }) {
  const meta = VENUE_META[venue];
  return (
    <span
      // Only in compact mode: when the label is visible, a tooltip repeating it
      // is noise.
      title={compact ? meta.label : undefined}
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
      {compact ? <VisuallyHidden>{meta.label}</VisuallyHidden> : meta.label}
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
 *
 * `PERP` and `TOKEN` are abbreviations of a legal distinction, so the expansion
 * has to be reachable — not just hoverable on a desktop. It goes through
 * `<Tooltip>`, which opens on keyboard focus and is announced via
 * `aria-describedby`. That makes this badge focusable, so do NOT place it inside
 * a link or button; use `<Badge title>` there instead.
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

export function InstrumentBadge({
  kind,
  align = 'end',
}: {
  kind: InstrumentKind;
  /**
   * Defaults to `end` because this badge's canonical placement is the
   * right-hand side of a venue card header. A centred bubble there overhangs a
   * narrow viewport by ~72px, which is unreadable even once the page stops
   * scrolling sideways.
   */
  align?: 'center' | 'start' | 'end';
}) {
  const meta = KIND_LABELS[kind];
  return (
    <Tooltip content={meta.title} align={align}>
      <Badge tone={kind === 'perpetual' ? 'warn' : 'neutral'} mono>
        {meta.short}
      </Badge>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Stat
// ---------------------------------------------------------------------------

/**
 * A labelled figure.
 *
 * Rendered as a one-row `<dl>`: a label and its value are a description pair,
 * and marking them as two anonymous `<div>`s loses the association entirely for
 * assistive tech.
 */
export interface StatProps {
  label: string;
  value: ReactNode;
  /** Explanation of how the figure is derived. Shown as a tooltip on the label. */
  hint?: string;
  align?: 'left' | 'right';
}

export function Stat({ label, value, hint, align = 'left' }: StatProps) {
  const labelStyle: CSSProperties = {
    fontSize: 'var(--mr-text-2xs)',
    color: 'var(--mr-text-subtle)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 3,
    whiteSpace: 'nowrap',
  };

  return (
    <dl style={{ margin: 0, textAlign: align, minWidth: 0 }}>
      <dt style={labelStyle}>
        {hint ? (
          <Tooltip content={hint} underline>
            {label}
          </Tooltip>
        ) : (
          label
        )}
      </dt>
      <dd
        style={{
          margin: 0,
          fontSize: 'var(--mr-text-sm)',
          color: 'var(--mr-text)',
          fontWeight: 500,
        }}
      >
        {value}
      </dd>
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Section heading
// ---------------------------------------------------------------------------

/**
 * A section's heading, plus an optional right-aligned slot for metadata.
 *
 * `level` exists because heading order is a document-structure requirement, not
 * a style: an `<h2>` nested under another `<h2>`'s section skips a level and
 * breaks heading navigation. Default `2`, since every page here has exactly one
 * `<h1>`.
 */
export function SectionTitle({
  children,
  action,
  level = 2,
  id,
}: {
  children: ReactNode;
  action?: ReactNode;
  level?: 2 | 3 | 4;
  /** Set when a `<section>` points at this heading via `aria-labelledby`. */
  id?: string;
}) {
  const Heading = `h${level}` as 'h2' | 'h3' | 'h4';

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
      <Heading
        id={id}
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
      </Heading>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

/**
 * Nothing to show, and why — and, where there is one, the way out.
 *
 * Paragraphs rather than `<div>`s, so the text is traversable as text. No live
 * region: the places that swap content in and out — the market explorer's
 * filters — already announce the result count through their own `aria-live`, and
 * two announcements for one action is worse than one.
 *
 * `action` exists because a dead end the user cannot leave is not an empty
 * state, it is a trap. If the emptiness is the result of something the user did
 * — a filter, a search — pass the control that undoes it.
 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  /** The way out: a "clear filters" button, a link back. */
  action?: ReactNode;
}) {
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
      <p style={{ margin: 0, fontSize: 'var(--mr-text-md)', color: 'var(--mr-text)' }}>{title}</p>
      {hint && (
        <p style={{ margin: action ? '6px 0 18px' : '6px 0 0', fontSize: 'var(--mr-text-sm)' }}>
          {hint}
        </p>
      )}
      {action}
    </div>
  );
}
