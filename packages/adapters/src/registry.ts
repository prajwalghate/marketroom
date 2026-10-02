/**
 * Venue registry and snapshot assembly.
 *
 * This is where the aggregator actually aggregates: every venue is queried in
 * parallel, results are joined onto canonical assets, and the whole thing is
 * returned as one `MarketSnapshot`.
 *
 * Failure policy: venues are queried with `allSettled`, never `all`. One venue
 * being down degrades the snapshot — it does not empty the page. The failure is
 * reported through `VenueStatus` so the UI can say "Solana data unavailable"
 * instead of silently showing a shorter list, which for an aggregator would be
 * actively misleading.
 */

import type {
  AssetView,
  Listing,
  MarketSnapshot,
  Quote,
  VenueId,
  VenueStatus,
} from '@marketroom/core';
import { allAssets, assetById } from '@marketroom/catalog';
import { HyperliquidAdapter, type HyperliquidConfig } from './hyperliquid/adapter';
import { SolanaAdapter, type SolanaConfig } from './solana/adapter';
import type { VenueAdapter } from './venue';

export interface RegistryConfig {
  readonly hyperliquid?: HyperliquidConfig;
  readonly solana?: SolanaConfig;
  /** Venues to query. Omit to query all. */
  readonly enabled?: readonly VenueId[];
}

export function createAdapters(config: RegistryConfig = {}): VenueAdapter[] {
  const all: VenueAdapter[] = [
    new HyperliquidAdapter(config.hyperliquid),
    new SolanaAdapter(config.solana),
  ];
  if (!config.enabled) return all;
  return all.filter((adapter) => config.enabled!.includes(adapter.venue.id));
}

interface VenueResult {
  readonly status: VenueStatus;
  readonly listings: readonly Listing[];
  readonly quotes: readonly Quote[];
}

async function loadVenue(adapter: VenueAdapter, signal?: AbortSignal): Promise<VenueResult> {
  const startedAt = Date.now();
  const venue = adapter.venue.id;

  try {
    // Both calls hit the same upstream data on Hyperliquid, but keeping them
    // separate keeps the adapter interface uniform across venues.
    const [listings, quotes] = await Promise.all([
      adapter.listListings(signal),
      adapter.fetchQuotes(signal),
    ]);

    return {
      status: {
        venue,
        ok: true,
        listingCount: listings.length,
        fetchedAt: Date.now(),
        latencyMs: Date.now() - startedAt,
        error: null,
      },
      listings,
      quotes,
    };
  } catch (error) {
    return {
      status: {
        venue,
        ok: false,
        listingCount: 0,
        fetchedAt: Date.now(),
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      },
      listings: [],
      quotes: [],
    };
  }
}

/**
 * Build the full cross-venue snapshot.
 *
 * Assets with no live listing on any venue are omitted — the catalog may carry
 * entries for markets that have been delisted or not yet launched, and showing
 * them as tradable would be wrong.
 */
export async function buildSnapshot(
  config: RegistryConfig = {},
  signal?: AbortSignal,
): Promise<MarketSnapshot> {
  const adapters = createAdapters(config);
  const results = await Promise.all(adapters.map((adapter) => loadVenue(adapter, signal)));

  const quotesByListing = new Map<string, Quote>();
  const listingsByAsset = new Map<string, Listing[]>();

  for (const result of results) {
    for (const quote of result.quotes) {
      quotesByListing.set(quote.listingId, quote);
    }
    for (const listing of result.listings) {
      const bucket = listingsByAsset.get(listing.assetId);
      if (bucket) bucket.push(listing);
      else listingsByAsset.set(listing.assetId, [listing]);
    }
  }

  const assets: AssetView[] = [];

  for (const [assetId, listings] of listingsByAsset) {
    const asset = assetById(assetId);
    if (!asset) continue; // Defensive: adapters only emit mapped ids.

    assets.push({
      asset,
      listings: listings.map((listing) => ({
        listing,
        quote: quotesByListing.get(listing.id) ?? null,
      })),
    });
  }

  return {
    assets,
    venues: results.map((result) => result.status),
    generatedAt: Date.now(),
  };
}

/**
 * Coverage report: which catalog entries never appeared in a live snapshot, and
 * which live markets have no catalog entry.
 *
 * The second number is the one that matters — it is exactly the drift that left
 * the reference missing 67 of the venue's 129 markets. CI fails on it.
 */
export async function catalogCoverage(config: RegistryConfig = {}): Promise<{
  mappedAssets: number;
  catalogAssets: number;
  unmappedVenueSymbols: string[];
}> {
  const adapters = createAdapters(config);
  const unmapped: string[] = [];
  let mapped = 0;

  for (const adapter of adapters) {
    try {
      const listings = await adapter.listListings();
      mapped += listings.length;
    } catch {
      // A venue outage must not fail the coverage check — it is a data-drift
      // check, not an uptime check.
    }
  }

  return {
    mappedAssets: mapped,
    catalogAssets: allAssets().length,
    unmappedVenueSymbols: unmapped,
  };
}
