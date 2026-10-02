/**
 * Catalog public API.
 *
 * Lookup indexes are built once at module load. The universe is a few hundred
 * entries, so this is sub-millisecond and removes the need for any lookup
 * caching downstream.
 */

import type { Asset, VenueId } from '@marketroom/core';
import { ASSET_ENTRIES } from './assets/index';
import type { CatalogEntry, SolanaListingSeed } from './types';

export type { CatalogEntry, SolanaListingSeed } from './types';
export { defineAsset } from './types';

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

const entries = ASSET_ENTRIES as readonly CatalogEntry[];

const byId = new Map<string, Asset>();
const entryById = new Map<string, CatalogEntry>();

/** `${venue}:${upper(venueSymbol)}` → canonical asset id. */
const assetIdByVenueSymbol = new Map<string, string>();

const solanaSeeds: (SolanaListingSeed & { assetId: string })[] = [];

function toAsset(entry: CatalogEntry): Asset {
  return {
    id: entry.id,
    symbol: entry.symbol,
    name: entry.name,
    assetClass: entry.assetClass,
    taxonomy: entry.taxonomy,
    country: entry.country,
    summary: entry.summary,
    peers: entry.peers,
    isPrivate: entry.isPrivate,
    peRatio: entry.peRatio,
  };
}

for (const entry of entries) {
  if (byId.has(entry.id)) {
    throw new Error(`Duplicate catalog id "${entry.id}" — asset ids must be unique.`);
  }
  byId.set(entry.id, toAsset(entry));
  entryById.set(entry.id, entry);

  for (const symbol of entry.hyperliquid ?? []) {
    assetIdByVenueSymbol.set(`hyperliquid:${symbol.toUpperCase()}`, entry.id);
  }
  for (const seed of entry.solana ?? []) {
    // Mint addresses are case-sensitive base58; upper-casing the key is still
    // safe because lookups go through the same normalisation.
    assetIdByVenueSymbol.set(`solana:${seed.mint.toUpperCase()}`, entry.id);
    solanaSeeds.push({ ...seed, assetId: entry.id });
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const allAssets = (): Asset[] => [...byId.values()];

export const assetById = (id: string): Asset | undefined => byId.get(id);

export const catalogEntryById = (id: string): CatalogEntry | undefined => entryById.get(id);

/**
 * Map a venue's own symbol to a canonical asset id.
 *
 * Returns `undefined` for unmapped markets. Callers skip those rather than
 * failing — but CI's coverage check flags them, because silently dropping live
 * markets is exactly the drift that left the reference covering only 48% of the
 * venue.
 */
export function resolveAssetId(venue: VenueId, venueSymbol: string): string | undefined {
  return assetIdByVenueSymbol.get(`${venue}:${venueSymbol.toUpperCase()}`);
}

/** Stable, globally unique listing id. */
export const listingIdFor = (venue: VenueId, venueSymbol: string): string =>
  `${venue}:${venueSymbol}`;

/** Solana listings to quote. See `SolanaAdapter` for why these are curated. */
export const solanaListingSeeds = (): (SolanaListingSeed & { assetId: string })[] => [
  ...solanaSeeds,
];

/** Every venue symbol the catalog knows, for the coverage check. */
export function knownVenueSymbols(venue: VenueId): string[] {
  const prefix = `${venue}:`;
  return [...assetIdByVenueSymbol.keys()]
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
}

export const catalogSize = (): number => byId.size;
