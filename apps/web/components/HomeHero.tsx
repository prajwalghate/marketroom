'use client';

import type { AssetView } from '@marketroom/core';
import { useMarketViewState } from '@/lib/useMarketViewState';
import { Hero } from './Hero';

/**
 * Connects the hero's search box to the same URL-backed state the market
 * explorer uses.
 *
 * A thin client wrapper so the homepage itself stays a Server Component: the
 * hero needs the live query value, but nothing else above the table does.
 * Both this and the explorer read the same hook, so typing here filters the
 * table below and updates the URL exactly as before.
 */
export function HomeHero({ example }: { example: AssetView | null }) {
  const { queryInput, setQueryInput } = useMarketViewState();
  return <Hero example={example} queryInput={queryInput} onQueryChange={setQueryInput} />;
}
