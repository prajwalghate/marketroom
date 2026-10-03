'use client';

import type { MarketFilters, MarketViewState, SortKey } from '@marketroom/core';
import { isDefaultViewState, parseViewState, serializeViewState } from '@marketroom/core';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Market view state, held in the URL.
 *
 * The URL is the single source of truth for what the index is showing, which
 * is what makes a filtered view shareable, bookmarkable and restored on Back.
 * Previously this lived in `useState`, so a filtered view existed only in the
 * tab that produced it.
 *
 * Two details that are easy to get wrong:
 *
 *  1. **The text input keeps its own state.** Routing on every keystroke makes
 *     typing feel laggy, so the input is local and immediate, and the URL
 *     catches up on a debounce. Everything else (chips, sort) writes straight
 *     through, because those are discrete.
 *
 *  2. **A debounced write would otherwise fight Back.** When the URL changes we
 *     need to know whether we caused it. `lastWritten` records what we last
 *     pushed, so a change that doesn't match it is external — a Back, a pasted
 *     link — and only then do we overwrite what the user is typing.
 *
 * `replace` rather than `push`: a filter is a view of one page, not a new one.
 * Pushing would mean Back steps through every chip toggle before leaving.
 */

const DEBOUNCE_MS = 250;

export interface MarketViewController extends MarketViewState {
  /** The live input value — may be ahead of `filters.query` mid-type. */
  queryInput: string;
  setQueryInput: (value: string) => void;
  setFilters: (next: Partial<MarketFilters>) => void;
  setSort: (next: SortKey) => void;
  reset: () => void;
  isDefault: boolean;
}

export function useMarketViewState(): MarketViewController {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const search = searchParams.toString();
  const state = useMemo(() => parseViewState(search), [search]);

  const [queryInput, setQueryInputRaw] = useState(state.filters.query);
  const lastWritten = useRef(search);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const write = useCallback(
    (next: MarketViewState) => {
      const serialized = serializeViewState(next);
      if (serialized === lastWritten.current) return;
      lastWritten.current = serialized;
      // `scroll: false` — re-filtering should not yank the reader to the top.
      router.replace(serialized ? `${pathname}?${serialized}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  // Re-sync the input when the URL changed from outside this component:
  // Back/Forward, or a link someone pasted.
  useEffect(() => {
    if (search === lastWritten.current) return;
    lastWritten.current = search;
    setQueryInputRaw(parseViewState(search).filters.query);
  }, [search]);

  useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    },
    [],
  );

  const setQueryInput = useCallback(
    (value: string) => {
      setQueryInputRaw(value);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        write({ ...state, filters: { ...state.filters, query: value } });
      }, DEBOUNCE_MS);
    },
    [state, write],
  );

  const setFilters = useCallback(
    (next: Partial<MarketFilters>) => {
      write({ ...state, filters: { ...state.filters, query: queryInput, ...next } });
    },
    [queryInput, state, write],
  );

  const setSort = useCallback(
    (next: SortKey) => {
      write({ filters: { ...state.filters, query: queryInput }, sort: next });
    },
    [queryInput, state, write],
  );

  const reset = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setQueryInputRaw('');
    lastWritten.current = '';
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  return {
    // The committed query comes from the URL, but while the debounce is in
    // flight the input is the more current value — filtering off it keeps the
    // results in step with what the user sees themselves typing.
    filters: { ...state.filters, query: queryInput },
    sort: state.sort,
    queryInput,
    setQueryInput,
    setFilters,
    setSort,
    reset,
    // Delegated to core rather than re-implemented here. The inline copy this
    // replaces had silently fallen behind: it never learned about the country
    // filter, so a country-only view counted as "default" and the Clear control
    // never rendered — leaving no way out of the filter.
    isDefault: isDefaultViewState({
      filters: { ...state.filters, query: queryInput },
      sort: state.sort,
    }),
  };
}
