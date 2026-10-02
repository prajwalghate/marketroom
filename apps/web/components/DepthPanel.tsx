import type { OrderBook } from '@marketroom/core';
import { bookSpread, formatBps, formatPrice } from '@marketroom/core';

/**
 * Order book depth.
 *
 * Shows the top levels with a proportional size bar behind each row — the
 * standard pattern, because relative size at a level is far easier to read as a
 * bar than as a number.
 */

const LEVELS = 8;

export function DepthPanel({ book }: { book: OrderBook }) {
  const spread = bookSpread(book);
  const bids = book.bids.slice(0, LEVELS);
  const asks = book.asks.slice(0, LEVELS);

  // Normalise both sides against one maximum so bid and ask bars are directly
  // comparable — scaling each side independently would misrepresent imbalance.
  const maxSize = Math.max(...bids.map((l) => l.size), ...asks.map((l) => l.size), 1);

  return (
    <div
      style={{
        background: 'var(--mr-surface-1)',
        border: '1px solid var(--mr-border)',
        borderRadius: 'var(--mr-radius-lg)',
        overflow: 'hidden',
        fontSize: 'var(--mr-text-xs)',
      }}
    >
      {/* Asks are rendered top-down descending so the spread sits in the
          middle, as in every trading terminal. */}
      {[...asks].reverse().map((level, index) => (
        <DepthRow
          key={`a${index}`}
          price={level.price}
          size={level.size}
          max={maxSize}
          side="ask"
        />
      ))}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '7px 11px',
          background: 'var(--mr-surface-2)',
          borderTop: '1px solid var(--mr-border)',
          borderBottom: '1px solid var(--mr-border)',
        }}
      >
        <span style={{ color: 'var(--mr-text-subtle)' }}>Spread</span>
        <span className="mr-num" style={{ color: 'var(--mr-text-muted)' }}>
          {spread ? formatBps(spread.fraction) : '—'}
        </span>
      </div>

      {bids.map((level, index) => (
        <DepthRow
          key={`b${index}`}
          price={level.price}
          size={level.size}
          max={maxSize}
          side="bid"
        />
      ))}
    </div>
  );
}

function DepthRow({
  price,
  size,
  max,
  side,
}: {
  price: number;
  size: number;
  max: number;
  side: 'bid' | 'ask';
}) {
  const width = `${Math.min(100, (size / max) * 100)}%`;
  const color = side === 'bid' ? 'var(--mr-up)' : 'var(--mr-down)';
  const bar = side === 'bid' ? 'var(--mr-up-soft)' : 'var(--mr-down-soft)';

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        justifyContent: 'space-between',
        padding: '4px 11px',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          right: 'auto',
          width,
          background: bar,
          pointerEvents: 'none',
        }}
      />
      <span className="mr-num" style={{ color, position: 'relative' }}>
        {formatPrice(price)}
      </span>
      <span className="mr-num" style={{ color: 'var(--mr-text-subtle)', position: 'relative' }}>
        {size.toLocaleString('en-US', { maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}
