'use client';

import type { AssetClass, AssetView, Candle, SortKey, VenueId } from '@marketroom/core';
import {
  EMPTY_FILTERS,
  assetClassFacets,
  countryFacets,
  SORT_LABELS,
  SORT_KEYS,
  sectorFacets,
  selectAssets,
} from '@marketroom/core';
import { EmptyState } from '@marketroom/ui';
import { useDeferredValue, useMemo, useState } from 'react';
import { MarketTable } from './MarketTable';

/**
 * The index page's interactive shell.
 *
 * Filtering runs entirely client-side over data the server already sent, so
 * every keystroke and chip click is instant — no request, no spinner. That is
 * affordable because the universe is a few hundred rows; it would not be at
 * 100k, and this is the right trade at this size.
 *
 * `useDeferredValue` on the query keeps typing responsive: React renders the
 * input immediately and the (heavier) table at a lower priority, so the caret
 * never lags behind the keyboard.
 */

export interface MarketExplorerProps {
  assets: readonly AssetView[];
  sparklines: Record<string, Candle[]>;
}

const VENUE_OPTIONS: { id: VenueId; label: string }[] = [
  { id: 'hyperliquid', label: 'Hyperliquid' },
  { id: 'solana', label: 'Solana' },
];

export function MarketExplorer({ assets, sparklines }: MarketExplorerProps) {
  const [query, setQuery] = useState('');
  const [sectors, setSectors] = useState<string[]>([]);
  const [assetClasses, setAssetClasses] = useState<AssetClass[]>([]);
  const [venues, setVenues] = useState<VenueId[]>([]);
  const [multiVenueOnly, setMultiVenueOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('volume');

  const deferredQuery = useDeferredValue(query);

  const sectorOptions = useMemo(() => sectorFacets(assets), [assets]);
  const classOptions = useMemo(() => assetClassFacets(assets), [assets]);

  // A search re-orders by relevance regardless of the chosen sort. That has to
  // be the *same* value the select and the table headers render, or the UI
  // claims one ordering while showing another.
  const effectiveSort: SortKey = deferredQuery.trim() && sort === 'volume' ? 'relevance' : sort;

  const results = useMemo(
    () =>
      selectAssets(assets, {
        filters: {
          ...EMPTY_FILTERS,
          query: deferredQuery,
          sectors,
          assetClasses,
          venues,
          multiVenueOnly,
        },
        sort: effectiveSort,
      }),
    [assets, deferredQuery, sectors, assetClasses, venues, multiVenueOnly, effectiveSort],
  );

  // Counted over the results, not the universe: the old version read the facet
  // off `assets`, so it said "13 countries" even when nothing matched.
  const countryOptions = useMemo(() => countryFacets(results), [results]);

  const toggle = <T,>(list: T[], value: T, set: (next: T[]) => void) => {
    set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  const hasFilters =
    sectors.length > 0 || assetClasses.length > 0 || venues.length > 0 || multiVenueOnly || query;

  const reset = () => {
    setQuery('');
    setSectors([]);
    setAssetClasses([]);
    setVenues([]);
    setMultiVenueOnly(false);
  };

  return (
    <>
      {/* ── Controls ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 220 }}>
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 11,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--mr-text-subtle)',
              fontSize: 13,
              pointerEvents: 'none',
            }}
          >
            ⌕
          </span>
          <input
            className="mr-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search ticker, company, sector or mint…"
            aria-label="Search markets"
          />
        </div>

        {/* `relevance` is offered only while it is reachable — it is what a
            search actually applies, and hiding it made the select display
            "24h volume" over relevance-ordered rows. */}
        <select
          className="mr-select"
          value={effectiveSort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          aria-label="Sort markets"
        >
          {SORT_KEYS.filter((key) => key !== 'relevance' || effectiveSort === 'relevance').map(
            (key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ),
          )}
        </select>

        {VENUE_OPTIONS.map((venue) => (
          <button
            key={venue.id}
            type="button"
            className="mr-chip"
            aria-pressed={venues.includes(venue.id)}
            onClick={() => toggle(venues, venue.id, setVenues)}
          >
            {venue.label}
          </button>
        ))}

        <button
          type="button"
          className="mr-chip"
          aria-pressed={multiVenueOnly}
          onClick={() => setMultiVenueOnly((value) => !value)}
          title="Show only assets listed on more than one venue — the cross-venue comparison view"
        >
          Multi-venue
        </button>

        {hasFilters && (
          <button type="button" className="mr-btn" onClick={reset}>
            Clear
          </button>
        )}
      </div>

      {/* ── Asset class ───────────────────────────────────────────────── */}
      {/* Both chip rows looked identical, so there was nothing to tell a reader
          that one filters by instrument type and the other by sector. The
          labels name the dimension for sighted and screen-reader users alike. */}
      <div className="mr-filter-group" role="group" aria-label="Filter by asset class">
        <span className="mr-filter-label" aria-hidden="true">
          Class
        </span>
        {classOptions.map((facet) => (
          <button
            key={facet.value}
            type="button"
            className="mr-chip"
            aria-pressed={assetClasses.includes(facet.value as AssetClass)}
            aria-label={`${facet.value}, ${facet.count} markets`}
            onClick={() => toggle(assetClasses, facet.value as AssetClass, setAssetClasses)}
          >
            <span aria-hidden="true">{facet.value}</span>
            <span className="mr-chip-count" aria-hidden="true">
              {facet.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Sector ────────────────────────────────────────────────────── */}
      {/* Top-level sectors only. The reference exposed ~50 freeform chips,
          which is a wall of text rather than a filter. */}
      <div
        className="mr-filter-group"
        role="group"
        aria-label="Filter by sector"
        style={{ marginTop: 8, marginBottom: 18 }}
      >
        <span className="mr-filter-label" aria-hidden="true">
          Sector
        </span>
        {sectorOptions.slice(0, 12).map((facet) => (
          <button
            key={facet.value}
            type="button"
            className="mr-chip"
            aria-pressed={sectors.includes(facet.value)}
            aria-label={`${facet.value}, ${facet.count} markets`}
            onClick={() => toggle(sectors, facet.value, setSectors)}
          >
            <span aria-hidden="true">{facet.value}</span>
            <span className="mr-chip-count" aria-hidden="true">
              {facet.count}
            </span>
          </button>
        ))}
      </div>

      <div
        style={{
          fontSize: 'var(--mr-text-xs)',
          color: 'var(--mr-text-subtle)',
          marginBottom: 8,
        }}
        aria-live="polite"
        aria-atomic="true"
      >
        {results.length === assets.length
          ? `${assets.length} markets`
          : `${results.length} of ${assets.length} markets`}
        {countryOptions.length > 0 &&
          ` · ${countryOptions.length} ${countryOptions.length === 1 ? 'country' : 'countries'}`}
      </div>

      {results.length === 0 ? (
        <EmptyState
          title="No markets match"
          hint={
            query.trim()
              ? `Nothing in the index matches “${query.trim()}”.`
              : 'The active filters exclude every market.'
          }
          action={
            <button type="button" className="mr-btn" onClick={reset}>
              Clear all filters
            </button>
          }
        />
      ) : (
        <MarketTable
          assets={results}
          sparklines={sparklines}
          sort={effectiveSort}
          onSortChange={setSort}
        />
      )}
    </>
  );
}
