import type { Direction } from '@marketroom/core';
import { formatPercent, formatPrice } from '@marketroom/core';
import clsx from 'clsx';
import { VisuallyHidden } from './VisuallyHidden';

/**
 * Price change display.
 *
 * Accessibility note that drives the whole design: direction is signalled three
 * ways — colour, an explicit `+`/`−` sign, and an arrow glyph. Roughly 8% of
 * men have red/green colour deficiency, so colour alone would make the single
 * most important number in a finance UI unreadable for them.
 *
 * The sign comes from `formatPercent`, which is also where `null` becomes an em
 * dash rather than `NaN%`. The arrow is `aria-hidden` (a screen reader reading
 * "black up-pointing triangle" is noise) and the direction is re-stated as a
 * word for assistive tech instead.
 */

const DIRECTION_COLOR: Record<Direction, string> = {
  up: 'var(--mr-up)',
  down: 'var(--mr-down)',
  flat: 'var(--mr-flat)',
};

const ARROW: Record<Direction, string> = {
  up: '▲',
  down: '▼',
  flat: '–',
};

const LABEL: Record<Direction, string> = {
  up: 'up',
  down: 'down',
  flat: 'unchanged',
};

export interface PriceChangeProps {
  /** Fraction, not percent. `0.0213` renders as `+2.13%`. */
  fraction: number | null;
  direction?: Direction;
  /** Show the ▲/▼ glyph. Off in dense tables where the sign alone suffices. */
  showArrow?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function PriceChange({
  fraction,
  direction,
  showArrow = true,
  size = 'md',
  className,
}: PriceChangeProps) {
  const missing = fraction === null || !Number.isFinite(fraction);

  // A missing value is always neutral, even when a `direction` was passed. An
  // em dash tinted green claims a direction we do not have.
  const resolved: Direction = missing
    ? 'flat'
    : (direction ?? (fraction > 0 ? 'up' : fraction < 0 ? 'down' : 'flat'));

  const fontSize =
    size === 'sm' ? 'var(--mr-text-xs)' : size === 'lg' ? 'var(--mr-text-lg)' : 'var(--mr-text-sm)';

  return (
    <span
      className={clsx('mr-num', className)}
      style={{
        color: DIRECTION_COLOR[resolved],
        fontSize,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25em',
        fontWeight: 500,
        // Without this the arrow can wrap away from its number in a narrow
        // table cell, which inverts the meaning of the row above it.
        whiteSpace: 'nowrap',
      }}
    >
      {showArrow && !missing && (
        <span aria-hidden="true" style={{ fontSize: '0.75em' }}>
          {ARROW[resolved]}
        </span>
      )}
      {formatPercent(missing ? null : fraction)}
      {/* Screen readers get words, not a glyph — and "no data" rather than an
          em dash, which most screen readers skip silently. */}
      <VisuallyHidden>{missing ? ' no data' : ` ${LABEL[resolved]}`}</VisuallyHidden>
    </span>
  );
}

export interface PriceProps {
  value: number | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  muted?: boolean;
  className?: string;
}

export function Price({ value, size = 'md', muted, className }: PriceProps) {
  const fontSize = {
    sm: 'var(--mr-text-xs)',
    md: 'var(--mr-text-sm)',
    lg: 'var(--mr-text-lg)',
    xl: 'var(--mr-text-2xl)',
  }[size];

  return (
    <span
      className={clsx('mr-num', className)}
      style={{
        fontSize,
        color: muted ? 'var(--mr-text-muted)' : 'var(--mr-text)',
        fontWeight: size === 'xl' ? 600 : 500,
        whiteSpace: 'nowrap',
      }}
    >
      {formatPrice(value)}
    </span>
  );
}
