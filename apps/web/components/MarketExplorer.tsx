'use client';

import type { AssetView, Candle, SortKey } from '@marketroom/core';
import { assetClassFacets, countryFacets, sectorFacets, selectAssets } from '@marketroom/core';
import { EmptyState } from '@marketroom/ui';
import { FilterBar } from './FilterBar';
import { useDeferredValue, useMemo } from 'react';
import { useMarketViewState } from '@/lib/useMarketViewState';
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
 *
 * All view state lives in the URL — see `useMarketViewState`. This component
 * holds none of its own, so a filtered view is a link.
 */

export interface MarketExplorerProps {
  assets: readonly AssetView[];
  sparklines: Record<string, Candle[]>;
}

export function MarketExplorer({ assets, sparklines }: MarketExplorerProps) {
  const { filters, sort, queryInput, setFilters, setSort, reset, isDefault } = useMarketViewState();

  const deferredQuery = useDeferredValue(queryInput);

  const sectorOptions = useMemo(() => sectorFacets(assets), [assets]);
  const classOptions = useMemo(() => assetClassFacets(assets), [assets]);

  // A search re-orders by relevance regardless of the chosen sort. That has to
  // be the *same* value the select and the table headers render, or the UI
  // claims one ordering while showing another.
  const effectiveSort: SortKey = deferredQuery.trim() && sort === 'volume' ? 'relevance' : sort;

  const results = useMemo(
    () =>
      selectAssets(assets, { filters: { ...filters, query: deferredQuery }, sort: effectiveSort }),
    [assets, filters, deferredQuery, effectiveSort],
  );

  // Country options come from the whole universe, not the current results: a
  // select that removes every other option the moment you pick one cannot be
  // used to change your mind.
  const countryOptions = useMemo(() => countryFacets(assets), [assets]);

  return (
    <>
      <FilterBar
        filters={filters}
        sort={effectiveSort}
        sectorFacets={sectorOptions}
        countryFacets={countryOptions}
        classFacets={classOptions}
        resultCount={results.length}
        totalCount={assets.length}
        isDefault={isDefault}
        onFiltersChange={setFilters}
        onSortChange={setSort}
        onReset={reset}
      />

      {results.length === 0 ? (
        <EmptyState
          title="No markets match"
          hint={
            queryInput.trim()
              ? `Nothing in the index matches “${queryInput.trim()}”.`
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
