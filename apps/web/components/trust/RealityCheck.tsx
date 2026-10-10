import type { DisplayGapEntry } from '@marketroom/core';
import { formatNotional, formatPercentAdaptive, formatPrice } from '@marketroom/core';
import { VenueBadge } from '@marketroom/ui';
import Link from 'next/link';
import { RelativeTime } from '../RelativeTime';

/**
 * Shown vs. real — the homepage's live proof.
 *
 * The claim "a displayed price can be fiction" is unconvincing as a sentence.
 * So the hero shows it: the listings where the price on every other screen is
 * furthest from what a $1,000 order actually fills at, measured minutes ago,
 * each row a link to its receipts.
 *
 * Omitted entirely when nothing qualifies. A trust product does not stage its
 * own demonstration.
 */
export function RealityCheck({
  worst,
  noMarketCount,
  measuredAt,
  now,
  ticket,
}: {
  worst: readonly DisplayGapEntry[];
  noMarketCount: number;
  measuredAt: number | null;
  now: number;
  ticket: number;
}) {
  if (worst.length === 0 && noMarketCount === 0) return null;

  return (
    <aside className="mr-reality" aria-labelledby="reality-heading">
      <header className="mr-reality-head">
        <h2 id="reality-heading" className="mr-reality-title">
          Shown vs. real
        </h2>
        <span className="mr-reality-meta">
          {formatNotional(ticket)} order
          {measuredAt !== null && (
            <>
              {' · '}
              <RelativeTime epochMs={measuredAt} serverNow={now} />
            </>
          )}
        </span>
      </header>

      {worst.length > 0 && (
        <ol className="mr-reality-list">
          {worst.map(({ asset, listing }) => {
            const gap = listing.displayGap;
            const signed = gap ? (gap.side === 'buy' ? gap.fraction : -gap.fraction) : null;
            return (
              <li key={listing.listingId}>
                <Link
                  href={`/market/${asset.view.asset.id}`}
                  className={`mr-reality-row is-${listing.verdict}`}
                  prefetch
                >
                  <span className="mr-reality-id">
                    <span className="mr-num mr-reality-ticker">{asset.view.asset.symbol}</span>
                    <VenueBadge venue={listing.venue} compact />
                  </span>
                  <span className="mr-reality-figs">
                    <span className="mr-reality-shown">
                      <span className="mr-reality-k">shows</span>
                      <span className="mr-num">{formatPrice(listing.displayedPrice)}</span>
                    </span>
                    <span className="mr-reality-real">
                      <span className="mr-reality-k">
                        {gap?.side === 'sell' ? 'sells at' : 'fills at'}
                      </span>
                      <span className="mr-num">{formatPrice(gap?.price ?? null)}</span>
                    </span>
                  </span>
                  <span className="mr-num mr-reality-gap">
                    {formatPercentAdaptive(signed, { signed: true })}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      {noMarketCount > 0 && (
        <p className="mr-reality-foot">
          <strong className="mr-num">{noMarketCount}</strong> more{' '}
          {noMarketCount === 1 ? 'listing shows' : 'listings show'} a price with no route to trade
          it at any size.
        </p>
      )}
    </aside>
  );
}
