import {
  aggregateVolume24h,
  bestContrastExample,
  formatCompactUsd,
  marketTotals,
  primaryListing,
} from '@marketroom/core';
import { HomeHero } from '@/components/HomeHero';
import { MarketExplorer } from '@/components/MarketExplorer';
import { MarketPulse } from '@/components/MarketPulse';
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
 *
 * Reading `searchParams` opts this route into dynamic rendering, which is
 * deliberate: filter state lives in the URL, and a shared link has to arrive
 * already filtered. Rendering it statically would mean serving the unfiltered
 * table and letting the client correct it after hydration — a visible flash of
 * the wrong content on exactly the links people pass around.
 *
 * It costs little, because the data underneath is still the shared cached
 * snapshot — this renders from memory, not from an upstream request.
 */

// The snapshot behind this page is reused for 15s; see `getSnapshot`.
export const revalidate = 15;

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Awaited for its effect on rendering mode, not its value — the filters
  // themselves are read from the URL by `useMarketViewState`, so that one
  // parser is the only thing that decides what a query string means.
  await searchParams;

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

  const totals = marketTotals(snapshot.assets);
  const venueCount = snapshot.venues.filter((venue) => venue.ok).length;

  // Picked from live data: the most liquid asset whose venues are genuinely
  // different products. Omitted entirely if none qualifies — the hero never
  // fabricates an example.
  const contrast = bestContrastExample(snapshot.assets);

  return (
    <div className="mr-container">
      <HomeHero example={contrast} />

      {/* A description list, not four pairs of divs: these are label/value
          pairs, and the markup should say so — otherwise a screen reader reads
          eight unrelated strings. */}
      <dl className="mr-stat-row" style={{ margin: '0 0 26px' }}>
        <StatCell label="Markets indexed" value={String(totals.assetCount)} />
        <StatCell label="24h volume" value={formatCompactUsd(totals.volume24hUsd)} />
        <StatCell
          label="On 2+ venues"
          value={String(totals.multiVenueCount)}
          hint="Assets listed on both Hyperliquid and Solana — the cross-venue comparison set"
        />
        <StatCell
          label="Venues live"
          value={`${venueCount} / ${snapshot.venues.length}`}
          hint="Venues currently responding to data requests"
        />
      </dl>

      {/* The layer between the hero and the raw table. Without it the reader
          has to derive every insight from 111 rows themselves. */}
      <MarketPulse assets={snapshot.assets} />

      <VenueHealth venues={snapshot.venues} />

      <h2 className="sr-only">All markets</h2>
      <MarketExplorer assets={snapshot.assets} sparklines={sparklines} />
    </div>
  );
}

function StatCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="mr-stat-cell">
      <dt
        style={{
          fontSize: 'var(--mr-text-2xs)',
          color: 'var(--mr-text-subtle)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 5,
        }}
        title={hint}
      >
        {label}
      </dt>
      <dd
        className="mr-num"
        style={{
          margin: 0,
          fontSize: 'var(--mr-text-xl)',
          fontWeight: 600,
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </dd>
    </div>
  );
}
