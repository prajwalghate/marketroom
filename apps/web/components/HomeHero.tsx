'use client';

import type { AssetView } from '@marketroom/core';
import { useCallback, type ReactNode } from 'react';
import { useMarketViewState } from '@/lib/useMarketViewState';
import { Hero } from './Hero';

/**
 * Connects the hero's search to the same URL-backed state the market explorer
 * uses.
 *
 * A thin client wrapper so the homepage itself stays a Server Component: the
 * hero needs the live query value, but nothing else above the table does.
 * Both this and the explorer read the same hook, so committing a query here
 * filters the table below and updates the URL.
 */
export function HomeHero({
  aside,
  claim,
  assets,
}: {
  /** Server-rendered, passed through untouched — this wrapper only owns search state. */
  aside: ReactNode;
  claim: { readonly listings: number; readonly untradable: number } | null;
  assets: readonly AssetView[];
}) {
  const { queryInput, setQueryInput, commitQuery, cancelQueryWrite } = useMarketViewState();

  const seeAll = useCallback(() => {
    commitQuery();
    // The table is the whole point of "see all", and it sits below the fold.
    // Landing on it is the difference between the control doing something and
    // appearing to do nothing. `scroll-margin-top` on the target clears the
    // sticky header; `smooth` is skipped for anyone who asked for less motion.
    const target = document.getElementById('markets');
    if (!target) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }, [commitQuery]);

  return (
    <Hero
      aside={aside}
      claim={claim}
      assets={assets}
      queryInput={queryInput}
      onQueryChange={setQueryInput}
      onSeeAll={seeAll}
      onNavigateAway={cancelQueryWrite}
    />
  );
}
