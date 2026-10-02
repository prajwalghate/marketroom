import 'server-only';

import { buildSnapshot, HyperliquidAdapter, SolanaAdapter } from '@marketroom/adapters';
import type {
  AssetView,
  Candle,
  Interval,
  Listing,
  MarketSnapshot,
  OrderBook,
  VenueCostInputs,
} from '@marketroom/core';
import { bookSpread } from '@marketroom/core';
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

const config = {
  hyperliquid: {
    apiUrl: process.env.NEXT_PUBLIC_HYPERLIQUID_API_URL ?? 'https://api.hyperliquid.xyz',
    dex: process.env.NEXT_PUBLIC_HYPERLIQUID_DEX ?? 'xyz',
    tradeUrl: 'https://app.trade.xyz',
  },
  solana: {
    apiUrl: process.env.NEXT_PUBLIC_JUPITER_API_URL ?? 'https://lite-api.jup.ag',
    tradeUrl: 'https://jup.ag/swap',
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
