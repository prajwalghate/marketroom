import { aggregateVolume24h, formatCompactUsd, primaryListing } from '@marketroom/core';
import { MarketExplorer } from '@/components/MarketExplorer';
import { VenueHealth } from '@/components/VenueHealth';
import { getSnapshot, getSparklineData } from '@/lib/data';

/**
 * Market index — the primary surface.
 *
 * This is a Server Component. Prices, volumes and sparklines are fetched on the
 * server from an already-warm cache and streamed into the HTML, so the first
 * paint contains real numbers. The client takes over afterwards for filtering
 * and live ticks.
 *
 * That ordering is what satisfies the "no visible loading spinners" requirement
 * structurally — there is no client-side fetch on the critical path to spin
 * for.
 */

// ISR: the page is regenerated at most every 15s and served from cache in
// between, so a visitor is never waiting on an upstream API.
export const revalidate = 15;

export default async function MarketsPage() {
  const snapshot = await getSnapshot();

  // Sparklines only for the busiest markets — 129 candle series per render
  // would cost more than everything else on the page combined, and rows far
  // down the list do not earn it.
  const topListings = [...snapshot.assets]
    .sort((a, b) => (aggregateVolume24h(b) ?? 0) - (aggregateVolume24h(a) ?? 0))
    .slice(0, 24)
    .flatMap((view) => {
      const primary = primaryListing(view);
      return primary && primary.listing.venue === 'hyperliquid' ? [primary.listing] : [];
    });

  const sparklines = await getSparklineData(topListings);

  const totalVolume = snapshot.assets.reduce(
    (sum, view) => sum + (aggregateVolume24h(view) ?? 0),
    0,
  );
  const multiVenue = snapshot.assets.filter((view) => view.listings.length > 1).length;
  const venueCount = snapshot.venues.filter((venue) => venue.ok).length;

  return (
    <div className="mr-container">
      <section style={{ marginBottom: 26 }}>
        <h1
          style={{
            margin: '0 0 8px',
            fontSize: 'var(--mr-text-2xl)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          Every tokenized equity, across every venue
        </h1>
        <p
          style={{
            margin: 0,
            maxWidth: '68ch',
            color: 'var(--mr-text-muted)',
            fontSize: 'var(--mr-text-base)',
            lineHeight: 1.6,
          }}
        >
          The same ticker can hide very different products — a leveraged perpetual, or a
          custody-backed token you can actually redeem. Marketroom indexes both, side by side, with
          live prices and the structural differences made explicit.
        </p>
      </section>

      <div className="mr-stat-row" style={{ marginBottom: 22 }}>
        <StatCell label="Markets indexed" value={String(snapshot.assets.length)} />
        <StatCell label="24h volume" value={formatCompactUsd(totalVolume)} />
        <StatCell label="On 2+ venues" value={String(multiVenue)} />
        <StatCell label="Venues live" value={`${venueCount} / ${snapshot.venues.length}`} />
      </div>

      <VenueHealth venues={snapshot.venues} />

      <MarketExplorer assets={snapshot.assets} sparklines={sparklines} />
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="mr-stat-cell">
      <div
        style={{
          fontSize: 'var(--mr-text-2xs)',
          color: 'var(--mr-text-subtle)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <div
        className="mr-num"
        style={{ fontSize: 'var(--mr-text-xl)', fontWeight: 600, letterSpacing: '-0.02em' }}
      >
        {value}
      </div>
    </div>
  );
}
