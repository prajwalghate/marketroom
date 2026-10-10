/**
 * Depth measurement across every venue.
 *
 * The web app asks for "the depth of these listings" and never learns which
 * venue needs a book walk and which needs a routed quote. That keeps the
 * venue-specific method where it belongs, and keeps a third venue an adapter
 * change rather than a route change.
 *
 * Failure policy matches the snapshot's: a venue or a listing that cannot be
 * measured is simply absent from the result, and `core` reports it as "not
 * measured" — never as an empty market.
 */

import type { DepthProbe, Listing, ProbeIndex } from '@marketroom/core';
import { PROBE_SIZES_USD } from '@marketroom/core';
import { mapSettledLimit } from './http';
import { HyperliquidAdapter, type HyperliquidConfig } from './hyperliquid/adapter';
import { SolanaAdapter, type SolanaConfig } from './solana/adapter';

export interface MeasureOptions {
  /** Probe sizes for book-walked venues. A book walk prices every size from one request. */
  readonly sizes?: readonly number[];
  /**
   * Probe sizes for routed venues, where every size and side is its own
   * request against a rate-limited API. The index needs only the sizes a
   * verdict reads ($1k and $10k); a market page asks for the full ladder.
   */
  readonly routedSizes?: readonly number[];
  readonly hyperliquid?: HyperliquidConfig;
  readonly solana?: SolanaConfig;
  readonly signal?: AbortSignal;
  /**
   * Also fetch each perp's most recent trade. Ten times the rate-limit weight
   * of a book, so it is for a handful of listings on a detail page, not for
   * the whole index.
   */
  readonly withLastTrade?: boolean;
}

/** Book requests in flight at once. Each weighs 2 of Hyperliquid's 1,200-per-minute budget. */
const BOOK_CONCURRENCY = 8;

/**
 * The last probe per listing that measured anything, and how long it may
 * stand in for a pass that measured nothing.
 *
 * A routed venue on a free tier will occasionally answer a whole pass with
 * 429s. Without this, one throttled pass erases a good measurement taken
 * seconds earlier and the page reports every token as "not measured". With
 * it, the page shows the earlier measurement — with its own timestamp, which
 * every surface displays — until it is half an hour old.
 *
 * Process-local, like the snapshot's fallback: no infrastructure, and a cold
 * instance degrades to exactly the honest "not measured".
 */
const lastGood = new Map<string, DepthProbe>();
const LAST_GOOD_MAX_AGE_MS = 30 * 60 * 1000;

const measuredAnything = (probe: DepthProbe) => probe.fills.some((f) => f.failure !== 'error');

function withLastGood(listings: readonly Listing[], index: Record<string, DepthProbe>) {
  const now = Date.now();
  for (const listing of listings) {
    const fresh = index[listing.id];
    if (fresh && measuredAnything(fresh)) {
      lastGood.set(listing.id, fresh);
      continue;
    }
    const previous = lastGood.get(listing.id);
    if (previous && now - previous.measuredAt < LAST_GOOD_MAX_AGE_MS) index[listing.id] = previous;
  }
  return index;
}

export async function measureDepth(
  listings: readonly Listing[],
  options: MeasureOptions = {},
): Promise<ProbeIndex> {
  const { sizes = PROBE_SIZES_USD, signal } = options;
  const routedSizes = options.routedSizes ?? sizes;
  const hyperliquid = new HyperliquidAdapter(options.hyperliquid);
  const solana = new SolanaAdapter(options.solana);

  const perps = listings.filter((l) => l.venue === 'hyperliquid');
  const tokens = listings.filter((l) => l.venue === 'solana');

  const [perpResults, tokenProbes] = await Promise.all([
    mapSettledLimit(perps, BOOK_CONCURRENCY, async (listing): Promise<DepthProbe> => {
      const [probe, lastTradeAt] = await Promise.all([
        hyperliquid.probeDepth(listing, sizes, signal),
        options.withLastTrade
          ? hyperliquid.fetchLastTradeAt(listing, signal).catch(() => null)
          : Promise.resolve(null),
      ]);
      return { ...probe, lastTradeAt };
    }),
    // One venue failing outright must not cost the other its measurements.
    solana.probeDepths(tokens, routedSizes, { signal }).catch((): DepthProbe[] => []),
  ]);

  const index: Record<string, DepthProbe> = {};
  perpResults.forEach((result) => {
    if (result.status === 'fulfilled') index[result.value.listingId] = result.value;
  });
  for (const probe of tokenProbes) index[probe.listingId] = probe;
  return withLastGood(listings, index);
}
