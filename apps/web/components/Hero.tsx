'use client';

import type { AssetView } from '@marketroom/core';
import type { ReactNode } from 'react';
import { MarketSearch } from './MarketSearch';

/**
 * Hero.
 *
 * The product's claim is that a price on a screen is a claim, not a fact — and
 * that this one checks it. A paragraph asserting that gives a reader no
 * reason to believe it, so the hero carries its own evidence: the subhead
 * states the live count, and the panel beside it (`aside`, server-rendered)
 * shows the worst cases measured minutes ago, each one a link to its
 * receipts. If nothing currently qualifies, the panel is omitted rather than
 * faked.
 */
export function Hero({
  aside,
  claim,
  assets,
  queryInput,
  onQueryChange,
  onSeeAll,
  onNavigateAway,
}: {
  aside: ReactNode;
  /** Live figures for the subhead. `null` when there is no measurement to cite. */
  claim: { readonly listings: number; readonly untradable: number } | null;
  assets: readonly AssetView[];
  queryInput: string;
  onQueryChange: (value: string) => void;
  onSeeAll: () => void;
  onNavigateAway: () => void;
}) {
  return (
    <section className="mr-hero">
      <div className="mr-hero-copy">
        <p className="mr-eyebrow">Live trust check · tokenized stocks</p>
        <h1 className="mr-hero-title">
          Every price is a claim.
          <br />
          We check it.
        </h1>
        <p className="mr-hero-sub">
          Marketroom measures what a real order would fill at — on every venue, from $100 to
          $100,000 — and shows its work.
          {claim && claim.untradable > 0 && (
            <>
              {' '}
              Right now{' '}
              <strong className="mr-hero-claim">
                {claim.untradable} of {claim.listings}
              </strong>{' '}
              listings show a price nobody can trade at.
            </>
          )}
        </p>

        {/* Search belongs here rather than down with the filters: on a market
            index it is the primary action, not a refinement. Its results are
            anchored to the field itself — see MarketSearch for why that is not
            optional. */}
        <div className="mr-hero-search">
          <MarketSearch
            assets={assets}
            query={queryInput}
            onQueryChange={onQueryChange}
            onSeeAll={onSeeAll}
            onNavigateAway={onNavigateAway}
          />
        </div>
      </div>

      {aside}
    </section>
  );
}
