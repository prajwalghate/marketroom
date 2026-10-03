import type { OrderBook } from '@marketroom/core';
import { bookSpread, formatBps, formatPrice } from '@marketroom/core';
import { RelativeTime } from './RelativeTime';
import { VisuallyHidden } from '@marketroom/ui';

/**
 * Order book depth.
 *
 * Shows the top levels with a proportional size bar behind each row — the
 * standard pattern, because relative size at a level is far easier to read as a
 * bar than as a number.
 *
 * Side is encoded three ways, not one. Colour alone is not enough: our up and
 * down tokens differ by ΔE2000 ≈ 6 under deuteranopia with near-identical
 * lightness, so to a dichromat a bid row and an ask row are the same colour.
 * So each row also carries a visually-hidden "Bid"/"Ask" label, and the bars
 * grow from opposite edges — bids from the left, asks from the right — which
 * makes the two halves structurally distinguishable at a glance for everyone.
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
      {/* Two unlabelled numeric columns are unreadable — nothing otherwise says
          which is price and which is size. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '6px 11px',
          color: 'var(--mr-text-subtle)',
          fontSize: 'var(--mr-text-2xs)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          borderBottom: '1px solid var(--mr-border-subtle)',
        }}
      >
        <span>Price</span>
        <span>Size</span>
      </div>

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

      {/* Everything else on this page ticks; this panel is a server-rendered
          snapshot. Saying when it was taken is the honest alternative to
          letting it look live. */}
      <div
        style={{
          padding: '6px 11px',
          color: 'var(--mr-text-subtle)',
          fontSize: 'var(--mr-text-2xs)',
          borderTop: '1px solid var(--mr-border-subtle)',
          textAlign: 'right',
        }}
      >
        Snapshot · <RelativeTime epochMs={book.observedAt} />
      </div>
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
  const isBid = side === 'bid';
  const width = `${Math.min(100, (size / max) * 100)}%`;
  const color = isBid ? 'var(--mr-up)' : 'var(--mr-down)';
  const bar = isBid ? 'var(--mr-up-soft)' : 'var(--mr-down-soft)';

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
          insetBlock: 0,
          // Bids grow from the left, asks from the right, so the two halves of
          // the book read as mirrored without depending on hue.
          ...(isBid ? { left: 0, right: 'auto' } : { right: 0, left: 'auto' }),
          width,
          background: bar,
          pointerEvents: 'none',
        }}
      />
      <span className="mr-num" style={{ color, position: 'relative' }}>
        <VisuallyHidden>{isBid ? 'Bid ' : 'Ask '}</VisuallyHidden>
        {formatPrice(price)}
      </span>
      <span className="mr-num" style={{ color: 'var(--mr-text-subtle)', position: 'relative' }}>
        {size.toLocaleString('en-US', { maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}
