import type { Verdict } from '@marketroom/core';
import {
  aggregateVolume24h,
  formatNotional,
  paperGapSurvival,
  primaryListing,
  REFERENCE_NOTIONAL_USD,
  SMALL_TICKET_USD,
  worstDisplayGaps,
} from '@marketroom/core';
import { HomeHero } from '@/components/HomeHero';
import { MarketExplorer } from '@/components/MarketExplorer';
import { MarketPulse } from '@/components/MarketPulse';
import { RealityCheck } from '@/components/trust/RealityCheck';
import { VenueHealth } from '@/components/VenueHealth';
import { getSnapshot, getSparklineData, getTrustBoard } from '@/lib/data';

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

/** Headroom for a cold measurement pass; see the market page. */
export const maxDuration = 30;

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Awaited for its effect on rendering mode, not its value — the filters
  // themselves are read from the URL by `useMarketViewState`, so that one
  // parser is the only thing that decides what a query string means.
  await searchParams;

  // The trust board is one measurement pass over every listing, cached and
  // shared like the snapshot it is built on.
  const [snapshot, board] = await Promise.all([getSnapshot(), getTrustBoard()]);

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

  const { stats } = board;
  const untradable = stats.byVerdict['quote-only'] + stats.byVerdict['no-market'];
  const survival = paperGapSurvival(board.assets);
  const verdicts: Record<string, Verdict> = {};
  for (const asset of board.assets) {
    for (const listing of asset.listings) verdicts[listing.listingId] = listing.verdict;
  }
  const measured = stats.listings - stats.byVerdict.unmeasured;

  return (
    <div className="mr-container">
      <HomeHero
        assets={snapshot.assets}
        claim={measured > 0 ? { listings: stats.listings, untradable } : null}
        aside={
          <RealityCheck
            worst={worstDisplayGaps(board.assets, 4)}
            noMarketCount={stats.byVerdict['no-market']}
            measuredAt={stats.oldestMeasurement}
            now={board.now}
            ticket={SMALL_TICKET_USD}
          />
        }
      />

      {/* A description list, not four pairs of divs: these are label/value
          pairs, and the markup should say so — otherwise a screen reader reads
          eight unrelated strings. */}
      <dl className="mr-stat-row" style={{ margin: '0 0 26px' }}>
        <StatCell
          label="Listings checked"
          value={String(stats.listings)}
          hint="Every listing on every venue, probed with real order sizes from $100 to $100,000"
        />
        <StatCell
          label={`Tradable at ${formatNotional(REFERENCE_NOTIONAL_USD)}`}
          value={String(stats.byVerdict.tradable)}
          tone="ok"
          hint="A $10,000 order fills within 1% of the market price"
        />
        <StatCell
          label="Price, no market"
          value={String(untradable)}
          tone={untradable > 0 ? 'danger' : undefined}
          hint="Shows a price, but a $1,000 trade lands more than 2% from it — or cannot fill at all"
        />
        <StatCell
          label="Gaps over 1% that survive $10k"
          value={survival.headlined > 0 ? `${survival.survive} of ${survival.headlined}` : '—'}
          hint="Cross-venue gaps over 1% on screen that still return a profit when both sides are traded at $10,000, before fees"
        />
      </dl>

      {/* The layer between the hero and the raw table. Without it the reader
          has to derive every insight from 111 rows themselves. */}
      <MarketPulse assets={snapshot.assets} trust={board.assets} />

      <VenueHealth venues={snapshot.venues} />

      {/* `id` is the target the hero's "see all results" scrolls to, so the
          control lands the reader on the table it just filtered. */}
      <section id="markets" className="mr-markets" aria-labelledby="markets-heading">
        <h2 id="markets-heading" className="sr-only">
          All markets
        </h2>
        <MarketExplorer assets={snapshot.assets} sparklines={sparklines} verdicts={verdicts} />
      </section>
    </div>
  );
}

function StatCell({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'ok' | 'danger';
}) {
  return (
    <div className={tone ? `mr-stat-cell is-${tone}` : 'mr-stat-cell'}>
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
