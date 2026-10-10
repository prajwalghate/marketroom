import 'server-only';

import {
  buildSnapshot,
  HyperliquidAdapter,
  measureDepth,
  SolanaAdapter,
} from '@marketroom/adapters';
import type {
  AssetTrust,
  AssetView,
  BoardStats,
  Candle,
  DepthProbe,
  Interval,
  Listing,
  MarketSession,
  MarketSnapshot,
  OrderBook,
  ProbeIndex,
  VenueCostInputs,
} from '@marketroom/core';
import {
  assetTrust,
  boardStats,
  bookSpread,
  candleRangeById,
  REFERENCE_NOTIONAL_USD,
  SMALL_TICKET_USD,
  usEquitySession,
} from '@marketroom/core';
import { unstable_cache } from 'next/cache';

/**
 * Server-side data layer.
 *
 * This is the "fast backend" requirement made concrete. The rule is: **one
 * poller, many readers.** The browser never calls Hyperliquid or Jupiter for
 * shared data. A single cached snapshot is fanned out to every request, so 100
 * concurrent visitors produce one upstream call, not 100.
 *
 * Why that matters beyond politeness to the upstream API: a cache hit is
 * measured in microseconds, so the index page renders its live prices *into the
 * first paint*. There is no client-side fetch to wait on and therefore no
 * loading spinner to design — which is the actual mechanism behind the
 * no-spinners requirement.
 */

const REVALIDATE_SECONDS = Number(process.env.SNAPSHOT_REVALIDATE_SECONDS ?? 15);

/** True while `next build` is prerendering pages, as opposed to serving them. */
const BUILDING = process.env.NEXT_PHASE === 'phase-production-build';

const config = {
  hyperliquid: {
    apiUrl: process.env.NEXT_PUBLIC_HYPERLIQUID_API_URL ?? 'https://api.hyperliquid.xyz',
    dex: process.env.NEXT_PUBLIC_HYPERLIQUID_DEX ?? 'xyz',
    tradeUrl: 'https://app.trade.xyz',
  },
  solana: {
    apiUrl: process.env.NEXT_PUBLIC_JUPITER_API_URL ?? 'https://lite-api.jup.ag',
    tradeUrl: 'https://jup.ag/swap',
    rpcUrl: process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com',
  },
};

/**
 * The cross-venue market snapshot.
 *
 * Cached by Next's data cache, shared across every request and every user.
 */
export const getSnapshot = unstable_cache(
  async (): Promise<MarketSnapshot> => buildSnapshot(config),
  ['market-snapshot'],
  { revalidate: REVALIDATE_SECONDS, tags: ['snapshot'] },
);

/** One asset's view, read from the shared snapshot — never a separate fetch. */
export async function getAssetView(assetId: string) {
  const snapshot = await getSnapshot();
  return snapshot.assets.find((view) => view.asset.id === assetId) ?? null;
}

/** Every asset id, for `generateStaticParams`. */
export async function getAllAssetIds(): Promise<string[]> {
  const snapshot = await getSnapshot();
  return snapshot.assets.map((view) => view.asset.id);
}

const LOOKBACK_MS: Record<Interval, number> = {
  '1m': 6 * 60 * 60 * 1000,
  '5m': 24 * 60 * 60 * 1000,
  '15m': 3 * 24 * 60 * 60 * 1000,
  '1h': 14 * 24 * 60 * 60 * 1000,
  '4h': 60 * 24 * 60 * 60 * 1000,
  '1d': 365 * 24 * 60 * 60 * 1000,
  '1w': 3 * 365 * 24 * 60 * 60 * 1000,
};

/**
 * Candles for a listing, cached per listing+interval.
 *
 * Cached longer than quotes: a 1h candle does not change 15 times a minute, and
 * this is what lets the detail page server-render its chart with no spinner.
 */
export const getCandles = unstable_cache(
  async (listing: Listing, interval: Interval): Promise<Candle[]> => {
    if (listing.venue !== 'hyperliquid') return [];
    const adapter = new HyperliquidAdapter(config.hyperliquid);
    try {
      return await adapter.fetchCandles(listing, interval, LOOKBACK_MS[interval]);
    } catch {
      // A chart failing must not take down the page around it.
      return [];
    }
  },
  ['candles'],
  { revalidate: 30, tags: ['candles'] },
);

/**
 * Order book. Short cache — depth is genuinely live, and this is the one panel
 * where a brief skeleton is honest rather than a design failure.
 */
export const getOrderBook = unstable_cache(
  async (listing: Listing): Promise<OrderBook | null> => {
    if (listing.venue !== 'hyperliquid') return null;
    const adapter = new HyperliquidAdapter(config.hyperliquid);
    try {
      return await adapter.fetchOrderBook(listing);
    } catch {
      return null;
    }
  },
  ['orderbook'],
  { revalidate: 5, tags: ['orderbook'] },
);

/**
 * Sparkline candles for the index page.
 *
 * Fetched for the top N assets only. Pulling 129 candle series on every index
 * render would be slower than the entire rest of the page combined, and rows
 * below the fold are not worth that cost.
 */
export const getSparklineData = unstable_cache(
  async (listings: Listing[]): Promise<Record<string, Candle[]>> => {
    const adapter = new HyperliquidAdapter(config.hyperliquid);
    const result: Record<string, Candle[]> = {};

    const settled = await Promise.allSettled(
      listings.map(async (listing) => ({
        id: listing.assetId,
        candles: await adapter.fetchCandles(listing, '1h', 24 * 60 * 60 * 1000),
      })),
    );

    for (const entry of settled) {
      if (entry.status === 'fulfilled' && entry.value.candles.length > 0) {
        result[entry.value.id] = entry.value.candles;
      }
    }
    return result;
  },
  ['sparklines'],
  { revalidate: 60, tags: ['sparklines'] },
);

// ---------------------------------------------------------------------------
// Trust check
// ---------------------------------------------------------------------------

/**
 * How long one measurement of the whole index is reused.
 *
 * Routed venues are the constraint. Every size and side on Solana is a quote
 * against Jupiter's free tier, which rate-limits sustained traffic — measured
 * during development, when a few thousand quotes in twenty minutes earned
 * HTTP 429 for every request after. The index pass asks only for the two
 * sizes a verdict reads, roughly 140 quotes, and reuses the result for five
 * minutes: under thirty quotes a minute on average. Every figure on the page
 * carries its measurement time, so the reader knows how old it is.
 */
const TRUST_REVALIDATE_SECONDS = 300;

let inflightPass: Promise<ProbeIndex> | null = null;

/** The sizes a verdict reads: the small ticket and the reference size. */
const INDEX_ROUTED_SIZES = [SMALL_TICKET_USD, REFERENCE_NOTIONAL_USD];

/**
 * A measurement pass that has not finished by now is cut off, and whatever it
 * could not measure is reported as "not measured".
 *
 * Without this a venue that hangs would hang the homepage with it. Being
 * honest that a listing went unmeasured is cheap; a page that never arrives
 * is not.
 */
const MEASUREMENT_DEADLINE_MS = 9_000;

/**
 * Every listing on every venue, probed: what a real order would fill at, right
 * now. Books are walked at the full ladder (one request prices every size);
 * routed venues at the sizes a verdict needs.
 *
 * One pass shared by every reader, exactly like the snapshot. The probes are
 * the expensive part; turning them into verdicts is pure and runs per render.
 */
export const getProbes = unstable_cache(
  async (): Promise<ProbeIndex> => {
    // Concurrent cache misses in one process share one pass. A build
    // prerenders dozens of pages at once, and each starting its own pass
    // would multiply the load on both venues by the worker's concurrency.
    inflightPass ??= (async () => {
      const snapshot = await getSnapshot();
      const listings = snapshot.assets.flatMap((view) => view.listings.map((l) => l.listing));
      return measureDepth(listings, {
        hyperliquid: config.hyperliquid,
        solana: config.solana,
        routedSizes: INDEX_ROUTED_SIZES,
        signal: AbortSignal.timeout(MEASUREMENT_DEADLINE_MS),
      });
    })().finally(() => {
      inflightPass = null;
    });
    return inflightPass;
  },
  // Separate keys for build and runtime. A build prerenders a hundred pages
  // at once and its pass is routinely throttled by both venues; sharing its
  // key would hand that throttled board to the first five minutes of real
  // visitors after every deploy.
  ['trust-probes-v2', BUILDING ? 'build' : 'runtime'],
  { revalidate: TRUST_REVALIDATE_SECONDS, tags: ['trust'] },
);

/**
 * The full ladder — $100 to $100k — for one asset's routed listings.
 *
 * The chart on a market page needs every size; the index does not. Measured
 * per asset, on demand, and cached as long as the index pass, so a page that
 * is read a thousand times costs eight quotes per token every five minutes.
 */
const getRoutedLadder = unstable_cache(
  async (listings: Listing[]): Promise<ProbeIndex> =>
    measureDepth(
      listings.filter((listing) => listing.venue !== 'hyperliquid'),
      {
        solana: config.solana,
        signal: AbortSignal.timeout(MEASUREMENT_DEADLINE_MS),
      },
    ),
  ['trust-ladder-v2'],
  { revalidate: TRUST_REVALIDATE_SECONDS, tags: ['trust'] },
);

export interface TrustBoard {
  readonly assets: readonly AssetTrust[];
  readonly stats: BoardStats;
  readonly session: MarketSession;
  readonly now: number;
}

export async function getTrustBoard(): Promise<TrustBoard> {
  const [snapshot, probes] = await Promise.all([getSnapshot(), getProbes()]);
  const now = Date.now();
  const session = usEquitySession(now);
  const assets = snapshot.assets.map((view) => assetTrust(view, probes, { now, session }));
  return { assets, stats: boardStats(assets), session, now };
}

/**
 * When each perp on this asset last traded.
 *
 * Per asset and short-lived: a recent-trades request weighs ten book requests
 * against the venue's rate limit, so it is spent on the market someone is
 * reading, never swept across the index.
 */
const getLastTrades = unstable_cache(
  async (listings: Listing[]): Promise<Record<string, number | null>> => {
    const adapter = new HyperliquidAdapter(config.hyperliquid);
    const entries = await Promise.all(
      listings
        .filter((listing) => listing.venue === 'hyperliquid')
        .map(async (listing) => {
          const at = await adapter.fetchLastTradeAt(listing).catch(() => null);
          return [listing.id, at] as const;
        }),
    );
    return Object.fromEntries(entries);
  },
  ['last-trades'],
  { revalidate: 30, tags: ['trust'] },
);

/**
 * One asset's trust check: the shared probes, the full ladder for its routed
 * listings, and last-trade times for its perps.
 *
 * A ladder that failed to measure never replaces an index probe that
 * succeeded — falling back to two measured sizes beats four unmeasured ones.
 */
export async function getAssetTrust(view: AssetView): Promise<AssetTrust> {
  const listings = view.listings.map((l) => l.listing);
  const [probes, ladder, lastTrades] = await Promise.all([
    getProbes(),
    // Not while `next build` prerenders every market at once: that would be a
    // few hundred routed quotes and a hundred trade lookups from one machine
    // in seconds — a rate-limit storm for numbers that are replaced at the
    // first runtime revalidation anyway. The build uses the shared pass.
    BUILDING ? Promise.resolve({} as ProbeIndex) : getRoutedLadder(listings),
    BUILDING ? Promise.resolve({} as Record<string, number | null>) : getLastTrades(listings),
  ]);
  const merged: Record<string, DepthProbe> = {};
  for (const { listing } of view.listings) {
    const full = ladder[listing.id];
    const fullMeasured = full?.fills.some((f) => f.failure !== 'error') ?? false;
    const probe = fullMeasured ? full : (probes[listing.id] ?? full);
    if (probe) merged[listing.id] = { ...probe, lastTradeAt: lastTrades[listing.id] ?? null };
  }
  const now = Date.now();
  return assetTrust(view, merged, { now, session: usEquitySession(now) });
}

// ---------------------------------------------------------------------------
// Cost of exposure
// ---------------------------------------------------------------------------

/**
 * Hyperliquid taker fee, as a fraction, charged on each side of a round trip.
 *
 * Hard-coded because the venue does not publish a per-market fee in the API.
 * It is a published venue-wide figure; if it moves, this is the one place to
 * change it, and the UI labels the result as an estimate.
 */
const HYPERLIQUID_TAKER_FEE = 0.00045;

/** Sizes offered in the UI. Quoted server-side so switching size costs nothing. */
export const EXPOSURE_SIZES = [1_000, 10_000, 100_000] as const;

/**
 * Execution and carry inputs for every venue carrying an asset.
 *
 * Cached per asset and size: these are two upstream round trips per Solana
 * listing, which is far too slow to do on a slider drag. Quoting all sizes up
 * front means the client can switch size and holding period with no network at
 * all.
 */
export const getExposureInputs = unstable_cache(
  async (view: AssetView, notionalUsd: number): Promise<VenueCostInputs[]> => {
    const hyperliquid = new HyperliquidAdapter(config.hyperliquid);
    const solana = new SolanaAdapter(config.solana);

    const results = await Promise.all(
      view.listings.map(async ({ listing, quote }): Promise<VenueCostInputs> => {
        const base = {
          listingId: listing.id,
          venue: listing.venue,
          kind: listing.kind,
          maxLeverage: listing.maxLeverage,
        };

        if (listing.venue === 'hyperliquid') {
          // Crossing the book costs half the spread each way, so a round trip
          // is one full spread, plus the taker fee twice.
          let roundTrip: number | null = null;
          try {
            const book = await hyperliquid.fetchOrderBook(listing);
            const spread = bookSpread(book);
            if (spread) roundTrip = spread.fraction + HYPERLIQUID_TAKER_FEE * 2;
          } catch {
            roundTrip = null;
          }
          return {
            ...base,
            roundTripFraction: roundTrip,
            fundingRatePerHour: quote?.fundingRate ?? null,
          };
        }

        return {
          ...base,
          roundTripFraction: await solana.fetchRoundTripCost(listing, notionalUsd),
          // A spot token charges no rent for holding it.
          fundingRatePerHour: null,
        };
      }),
    );

    return results;
  },
  ['exposure-inputs'],
  { revalidate: 120, tags: ['exposure'] },
);

/**
 * Candles for a named range.
 *
 * Separate from `getCandles` because the range carries its own interval: a
 * year of 1h bars is 8,760 points, which is slow to fetch and illegible to
 * draw. The range table picks an interval that keeps every window in a
 * readable band.
 */
export const getCandlesForRange = unstable_cache(
  async (listing: Listing, rangeId: string): Promise<Candle[]> => {
    const range = candleRangeById(rangeId);
    if (!range || listing.venue !== 'hyperliquid') return [];

    const adapter = new HyperliquidAdapter(config.hyperliquid);
    try {
      return await adapter.fetchCandles(listing, range.interval, range.lookbackMs);
    } catch {
      // A chart failing must not take down the page around it.
      return [];
    }
  },
  ['candles-range'],
  { revalidate: 30, tags: ['candles'] },
);
