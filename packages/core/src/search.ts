/**
 * Search, filter and sort over the asset universe.
 *
 * Pure and synchronous: the whole universe is a few hundred rows, so this runs
 * in well under a frame on the client. Keeping it here (rather than in a
 * component) makes it unit-testable and keeps the UI layer declarative.
 *
 * Unlike the reference's plain `includes()` check, matches are *ranked* — an
 * exact ticker match must outrank an incidental substring hit in a summary
 * paragraph. Typing "GO" should surface GOOGL and GOLD first, not whichever
 * company happens to mention "go" in its editorial text.
 */

import {
  aggregateLiquidity,
  aggregateOpenInterest,
  aggregateVolume24h,
  consolidatedPrice,
  primaryListing,
  priceChange24h,
} from './derive';
import type { AssetClass, AssetView, VenueId } from './types';

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const RANK = {
  exactSymbol: 1000,
  symbolPrefix: 500,
  namePrefix: 300,
  symbolContains: 200,
  nameContains: 100,
  sectorMatch: 50,
  industryMatch: 40,
  countryMatch: 30,
  summaryMatch: 5,
} as const;

/** Relevance score for one asset against a query. `0` means no match. */
export function scoreAsset(view: AssetView, query: string): number {
  const term = query.trim().toLowerCase();
  if (!term) return 1;

  const { asset } = view;
  const symbol = asset.symbol.toLowerCase();
  const name = asset.name.toLowerCase();

  let score = 0;

  if (symbol === term) score += RANK.exactSymbol;
  else if (symbol.startsWith(term)) score += RANK.symbolPrefix;
  else if (symbol.includes(term)) score += RANK.symbolContains;

  if (name.startsWith(term)) score += RANK.namePrefix;
  else if (name.includes(term)) score += RANK.nameContains;

  if (asset.taxonomy.sector.toLowerCase().includes(term)) score += RANK.sectorMatch;
  if (asset.taxonomy.industry.toLowerCase().includes(term)) score += RANK.industryMatch;
  if (asset.country?.toLowerCase().includes(term)) score += RANK.countryMatch;

  // Venue symbols, so a user can paste `xyz:NVDA` or a mint address and land.
  for (const { listing } of view.listings) {
    if (listing.venueSymbol.toLowerCase().includes(term)) score += RANK.symbolContains;
  }

  // Lowest weight: the editorial text is long, so matches here are weak signals.
  if (score === 0 && asset.summary.toLowerCase().includes(term)) score += RANK.summaryMatch;

  return score;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export interface MarketFilters {
  readonly query: string;
  readonly sectors: readonly string[];
  readonly assetClasses: readonly AssetClass[];
  readonly venues: readonly VenueId[];
  readonly countries: readonly string[];
  /** Only assets listed on more than one venue — the cross-venue view. */
  readonly multiVenueOnly: boolean;
}

export const EMPTY_FILTERS: MarketFilters = {
  query: '',
  sectors: [],
  assetClasses: [],
  venues: [],
  countries: [],
  multiVenueOnly: false,
};

function passesFilters(view: AssetView, filters: MarketFilters): boolean {
  const { asset, listings } = view;

  if (filters.sectors.length > 0 && !filters.sectors.includes(asset.taxonomy.sector)) {
    return false;
  }
  if (filters.assetClasses.length > 0 && !filters.assetClasses.includes(asset.assetClass)) {
    return false;
  }
  if (
    filters.countries.length > 0 &&
    (!asset.country || !filters.countries.includes(asset.country))
  ) {
    return false;
  }
  if (
    filters.venues.length > 0 &&
    !listings.some((l) => filters.venues.includes(l.listing.venue))
  ) {
    return false;
  }
  if (filters.multiVenueOnly && listings.length < 2) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export const SORT_KEYS = [
  'relevance',
  'volume',
  'openInterest',
  'liquidity',
  'change',
  'changeAsc',
  'price',
  'symbol',
  'sector',
  'venues',
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_LABELS: Record<SortKey, string> = {
  relevance: 'Best match',
  volume: '24h volume',
  openInterest: 'Open interest',
  liquidity: 'Liquidity',
  change: 'Top gainers',
  changeAsc: 'Top losers',
  price: 'Price',
  symbol: 'Ticker A–Z',
  sector: 'Sector',
  venues: 'Most venues',
};

function changeFraction(view: AssetView): number | null {
  const primary = primaryListing(view);
  if (!primary?.quote) return null;
  return priceChange24h(primary.quote)?.fraction ?? null;
}

/**
 * Descending comparator that always sorts missing values last, regardless of
 * direction. A row with no data should never win a "top gainers" sort by
 * default-ordering to the top — the reference got this subtly wrong by mapping
 * nulls to `Infinity`/`-1`.
 */
function byDescending(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

function byAscending(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface SelectOptions {
  readonly filters: MarketFilters;
  readonly sort: SortKey;
}

/**
 * Filter + rank + sort in one pass. This is the single function the index page
 * calls; the UI holds only `filters` and `sort` as state.
 */
export function selectAssets(
  universe: readonly AssetView[],
  { filters, sort }: SelectOptions,
): AssetView[] {
  const scored: { view: AssetView; score: number }[] = [];

  for (const view of universe) {
    if (!passesFilters(view, filters)) continue;
    const score = scoreAsset(view, filters.query);
    if (score === 0) continue;
    scored.push({ view, score });
  }

  // When searching, relevance always wins — an explicit sort is a tiebreaker.
  const searching = filters.query.trim().length > 0;
  const effective: SortKey = searching && sort === 'relevance' ? 'relevance' : sort;

  scored.sort((a, b) => {
    if (effective === 'relevance') {
      if (b.score !== a.score) return b.score - a.score;
      return byDescending(aggregateVolume24h(a.view), aggregateVolume24h(b.view));
    }

    switch (effective) {
      case 'volume':
        return byDescending(aggregateVolume24h(a.view), aggregateVolume24h(b.view));
      case 'openInterest':
        return byDescending(aggregateOpenInterest(a.view), aggregateOpenInterest(b.view));
      case 'liquidity':
        return byDescending(aggregateLiquidity(a.view), aggregateLiquidity(b.view));
      case 'change':
        return byDescending(changeFraction(a.view), changeFraction(b.view));
      case 'changeAsc':
        return byAscending(changeFraction(a.view), changeFraction(b.view));
      case 'price':
        return byDescending(consolidatedPrice(a.view), consolidatedPrice(b.view));
      case 'symbol':
        return a.view.asset.symbol.localeCompare(b.view.asset.symbol);
      case 'sector':
        return (
          a.view.asset.taxonomy.sector.localeCompare(b.view.asset.taxonomy.sector) ||
          byDescending(aggregateVolume24h(a.view), aggregateVolume24h(b.view))
        );
      case 'venues':
        return (
          b.view.listings.length - a.view.listings.length ||
          byDescending(aggregateVolume24h(a.view), aggregateVolume24h(b.view))
        );
      default:
        return 0;
    }
  });

  return scored.map((entry) => entry.view);
}

// ---------------------------------------------------------------------------
// Facets — filter options derived from the universe, with counts
// ---------------------------------------------------------------------------

export interface Facet {
  readonly value: string;
  readonly count: number;
}

function tally(universe: readonly AssetView[], pick: (v: AssetView) => string | null): Facet[] {
  const counts = new Map<string, number>();
  for (const view of universe) {
    const value = pick(view);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export const sectorFacets = (universe: readonly AssetView[]): Facet[] =>
  tally(universe, (v) => v.asset.taxonomy.sector);

export const countryFacets = (universe: readonly AssetView[]): Facet[] =>
  tally(universe, (v) => v.asset.country);

export const assetClassFacets = (universe: readonly AssetView[]): Facet[] =>
  tally(universe, (v) => v.asset.assetClass);
