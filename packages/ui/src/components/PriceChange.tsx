import type { Direction } from '@marketroom/core';
import { formatPercent, formatPrice } from '@marketroom/core';
import clsx from 'clsx';

/**
 * Price change display.
 *
 * Accessibility note that drives the whole design: direction is signalled three
 * ways — colour, an explicit `+`/`−` sign, and an arrow glyph. Roughly 8% of
 * men have red/green colour deficiency, so colour alone would make the single
 * most important number in a finance UI unreadable for them.
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
  const resolved: Direction =
    direction ??
    (fraction === null ? 'flat' : fraction > 0 ? 'up' : fraction < 0 ? 'down' : 'flat');

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
      }}
    >
      {showArrow && fraction !== null && (
        <span aria-hidden="true" style={{ fontSize: '0.75em' }}>
          {ARROW[resolved]}
        </span>
      )}
      {formatPercent(fraction)}
      {/* Screen readers get the direction in words, not a glyph. */}
      {fraction !== null && <span className="sr-only"> {LABEL[resolved]}</span>}
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
      }}
    >
      {formatPrice(value)}
    </span>
  );
}
