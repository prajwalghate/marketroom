/**
 * Filter state ⇄ URL query string.
 *
 * Kept pure and in `core` so the encoding is unit-testable without a browser,
 * and so the server and the client cannot disagree about what a URL means — a
 * shared link has to render the same view it was copied from.
 *
 * Design rules:
 *  - Defaults are omitted. An unfiltered index is `/`, not `/?q=&sort=volume`.
 *  - Unknown values are dropped rather than throwing. A hand-edited or stale
 *    URL should degrade to a sensible view, never to an error page.
 *  - Keys are short and readable, because people paste these at each other.
 */

import { ASSET_CLASSES, VENUES, type AssetClass, type VenueId } from './types';
import { EMPTY_FILTERS, SORT_KEYS, type MarketFilters, type SortKey } from './search';

export const DEFAULT_SORT: SortKey = 'volume';

export interface MarketViewState {
  readonly filters: MarketFilters;
  readonly sort: SortKey;
}

export const DEFAULT_VIEW_STATE: MarketViewState = {
  filters: EMPTY_FILTERS,
  sort: DEFAULT_SORT,
};

const PARAM = {
  query: 'q',
  sectors: 'sector',
  assetClasses: 'class',
  venues: 'venue',
  countries: 'country',
  multiVenue: 'multi',
  sort: 'sort',
} as const;

/** Accepts anything `URLSearchParams` does, plus Next's plain-object form. */
export type QuerySource =
  URLSearchParams | Record<string, string | string[] | undefined> | string | null | undefined;

function toSearchParams(source: QuerySource): URLSearchParams {
  if (!source) return new URLSearchParams();
  if (source instanceof URLSearchParams) return source;
  if (typeof source === 'string') return new URLSearchParams(source);

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    // Next gives repeated keys as an array; we encode multi-value as CSV, so
    // collapse either shape into one comma-joined entry.
    params.set(key, Array.isArray(value) ? value.join(',') : value);
  }
  return params;
}

/** Split a CSV param and keep only values the app actually knows about. */
function readList<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed?: readonly T[],
): T[] {
  const raw = params.get(key);
  if (!raw) return [];

  const seen = new Set<string>();
  const out: T[] = [];

  for (const part of raw.split(',')) {
    const value = part.trim();
    if (!value || seen.has(value)) continue;
    if (allowed && !allowed.includes(value as T)) continue;
    seen.add(value);
    out.push(value as T);
  }
  return out;
}

/**
 * Parse a query string into view state.
 *
 * Total: every malformed input resolves to the default view.
 */
export function parseViewState(source: QuerySource): MarketViewState {
  const params = toSearchParams(source);

  const sortParam = params.get(PARAM.sort);
  const sort: SortKey =
    sortParam && (SORT_KEYS as readonly string[]).includes(sortParam)
      ? (sortParam as SortKey)
      : DEFAULT_SORT;

  return {
    filters: {
      query: params.get(PARAM.query)?.slice(0, 120) ?? '',
      // Sectors are free-form curated strings, so there is no allow-list to
      // check against here — `selectAssets` simply matches nothing for a
      // sector that does not exist.
      sectors: readList(params, PARAM.sectors),
      assetClasses: readList<AssetClass>(params, PARAM.assetClasses, ASSET_CLASSES),
      venues: readList<VenueId>(params, PARAM.venues, VENUES),
      // ISO-3166 codes are curated strings like `US` or `US/AU`, so there is no
      // allow-list to validate against — an unknown code simply matches nothing.
      countries: readList(params, PARAM.countries),
      multiVenueOnly: params.get(PARAM.multiVenue) === '1',
    },
    sort,
  };
}

/**
 * Serialize view state back to a query string.
 *
 * Omits anything at its default, so the URL stays short and a cleared view
 * produces an empty string rather than a trail of empty parameters.
 */
export function serializeViewState({ filters, sort }: MarketViewState): string {
  const params = new URLSearchParams();

  const query = filters.query.trim();
  if (query) params.set(PARAM.query, query);
  if (filters.sectors.length > 0) params.set(PARAM.sectors, filters.sectors.join(','));
  if (filters.assetClasses.length > 0)
    params.set(PARAM.assetClasses, filters.assetClasses.join(','));
  if (filters.venues.length > 0) params.set(PARAM.venues, filters.venues.join(','));
  if (filters.countries.length > 0) params.set(PARAM.countries, filters.countries.join(','));
  if (filters.multiVenueOnly) params.set(PARAM.multiVenue, '1');
  if (sort !== DEFAULT_SORT) params.set(PARAM.sort, sort);

  return params.toString();
}

/** True when the view is in its default state — used to show "Clear". */
export function isDefaultViewState({ filters, sort }: MarketViewState): boolean {
  return (
    filters.query.trim() === '' &&
    filters.sectors.length === 0 &&
    filters.assetClasses.length === 0 &&
    filters.venues.length === 0 &&
    filters.countries.length === 0 &&
    !filters.multiVenueOnly &&
    sort === DEFAULT_SORT
  );
}
