import 'server-only';

import { buildSnapshot, HyperliquidAdapter } from '@marketroom/adapters';
import type { Candle, Interval, Listing, MarketSnapshot, OrderBook } from '@marketroom/core';
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
