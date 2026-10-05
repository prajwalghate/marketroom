/**
 * Market intelligence derivations.
 *
 * The index answers "what exists". These answer "what is worth looking at",
 * which is the layer between a hero and a 111-row table — without it a reader
 * has to derive every insight from the raw grid themselves.
 *
 * Extracted here rather than computed per page so the homepage and the trends
 * page cannot drift apart: one definition of "biggest mover", used twice.
 *
 * Every function is pure and returns `[]` rather than inventing a result when
 * the data does not support one. An empty movers list on a flat day is the
 * honest answer.
 */

import {
  aggregateOpenInterest,
  aggregateVolume24h,
  primaryListing,
  priceChange24h,
  venueSpread,
  type VenueSpread,
} from './derive';
import type { AssetView } from './types';

export interface MoverInsight {
  readonly view: AssetView;
  /** 24h change as a fraction. */
  readonly change: number;
}

export interface SpreadInsight {
  readonly view: AssetView;
  readonly spread: VenueSpread;
}

export interface VolumeInsight {
  readonly view: AssetView;
  readonly volumeUsd: number;
}

export interface OpenInterestInsight {
  readonly view: AssetView;
  readonly openInterestUsd: number;
}

/** 24h change for the listing that best represents an asset. */
export function changeOf(view: AssetView): number | null {
  const primary = primaryListing(view);
  if (!primary?.quote) return null;
  return priceChange24h(primary.quote)?.fraction ?? null;
}

function scored(universe: readonly AssetView[]): MoverInsight[] {
  return universe.flatMap((view) => {
    const change = changeOf(view);
    return change === null ? [] : [{ view, change }];
  });
}

/**
 * Biggest risers.
 *
 * Filtered by sign before slicing, not taken from one end of a sorted list.
 * On a broadly red day the latter silently fills "gainers" with losers.
 */
export function topGainers(universe: readonly AssetView[], limit = 5): MoverInsight[] {
  return scored(universe)
    .filter((entry) => entry.change > 0)
    .sort((a, b) => b.change - a.change)
    .slice(0, limit);
}

export function topLosers(universe: readonly AssetView[], limit = 5): MoverInsight[] {
  return scored(universe)
    .filter((entry) => entry.change < 0)
    .sort((a, b) => a.change - b.change)
    .slice(0, limit);
}

/**
 * Largest price gaps for the same underlying across venues.
 *
 * Marketroom's signature metric — it is only computable because one asset
 * holds many listings, and `venueSpread` already discards implausible gaps
 * that indicate a bad catalog mapping rather than a real dislocation.
 *
 * **Only comparable spreads are ranked.** A leaderboard sorted on raw gap size
 * selects precisely for the listings least able to support a trade: the wider
 * the gap, the likelier one side is a stale print from an empty pool. Before
 * this filter the top of the list was ASML at 5.7%, with $107 of liquidity
 * behind the expensive leg — the panel was, in effect, ranking broken markets
 * and presenting them as opportunities.
 */
export function topDislocations(universe: readonly AssetView[], limit = 5): SpreadInsight[] {
  return universe
    .flatMap((view) => {
      const spread = venueSpread(view);
      return spread?.comparable ? [{ view, spread }] : [];
    })
    .sort((a, b) => b.spread.fraction - a.spread.fraction)
    .slice(0, limit);
}

export function topByVolume(universe: readonly AssetView[], limit = 5): VolumeInsight[] {
  return universe
    .flatMap((view) => {
      const volumeUsd = aggregateVolume24h(view);
      return volumeUsd === null || volumeUsd <= 0 ? [] : [{ view, volumeUsd }];
    })
    .sort((a, b) => b.volumeUsd - a.volumeUsd)
    .slice(0, limit);
}

export function topByOpenInterest(
  universe: readonly AssetView[],
  limit = 5,
): OpenInterestInsight[] {
  return universe
    .flatMap((view) => {
      const openInterestUsd = aggregateOpenInterest(view);
      return openInterestUsd === null || openInterestUsd <= 0 ? [] : [{ view, openInterestUsd }];
    })
    .sort((a, b) => b.openInterestUsd - a.openInterestUsd)
    .slice(0, limit);
}

/**
 * The asset that best demonstrates "same ticker, different product".
 *
 * Used by the homepage to show the thesis with live data rather than assert it
 * in copy. Prefers the most liquid asset that is listed on more than one venue
 * *and* whose listings genuinely differ in what they confer — a pair that
 * differs only in price proves nothing.
 */
export function bestContrastExample(universe: readonly AssetView[]): AssetView | null {
  const candidates = universe.filter((view) => {
    if (view.listings.length < 2) return false;
    const kinds = new Set(view.listings.map((l) => l.listing.kind));
    if (kinds.size < 2) return false;
    // Both sides must be quoted, or the comparison renders half-empty.
    return view.listings.every((l) => l.quote !== null);
  });

  if (candidates.length === 0) return null;

  return candidates.reduce((best, view) =>
    (aggregateVolume24h(view) ?? 0) > (aggregateVolume24h(best) ?? 0) ? view : best,
  );
}

/** Headline counts for the market-pulse strip. */
export interface MarketTotals {
  readonly assetCount: number;
  readonly multiVenueCount: number;
  readonly volume24hUsd: number;
  readonly openInterestUsd: number;
}

export function marketTotals(universe: readonly AssetView[]): MarketTotals {
  let volume = 0;
  let openInterest = 0;
  let multiVenue = 0;

  for (const view of universe) {
    volume += aggregateVolume24h(view) ?? 0;
    openInterest += aggregateOpenInterest(view) ?? 0;
    if (view.listings.length > 1) multiVenue += 1;
  }

  return {
    assetCount: universe.length,
    multiVenueCount: multiVenue,
    volume24hUsd: volume,
    openInterestUsd: openInterest,
  };
}
