'use client';

import type { AssetView } from '@marketroom/core';
import { formatPercentAbs, formatPrice, priceChange24h, venueSpread } from '@marketroom/core';
import { Badge, InstrumentBadge, VenueBadge } from '@marketroom/ui';
import Link from 'next/link';
import { MarketSearch } from './MarketSearch';

/**
 * Hero.
 *
 * The product's claim is "the same ticker can be a different product". Stating
 * that in a paragraph is the weakest possible way to make it — a reader has no
 * reason to believe it and nothing to look at.
 *
 * So the hero *demonstrates* it, with a live asset: one ticker, two venues,
 * the actual prices, and the rights each one does and does not confer. Every
 * number here is real and from the same snapshot as the table below. If no
 * asset currently qualifies, the panel is omitted rather than faked.
 */
export function Hero({
  example,
  assets,
  queryInput,
  onQueryChange,
  onSeeAll,
  onNavigateAway,
}: {
  example: AssetView | null;
  assets: readonly AssetView[];
  queryInput: string;
  onQueryChange: (value: string) => void;
  onSeeAll: () => void;
  onNavigateAway: () => void;
}) {
  return (
    <section className="mr-hero">
      <div className="mr-hero-copy">
        <p className="mr-eyebrow">Tokenized market intelligence</p>
        <h1 className="mr-hero-title">Know what you&rsquo;re actually trading.</h1>
        <p className="mr-hero-sub">
          The same ticker can be a leveraged derivative on one venue and a redeemable,
          collateral-backed claim on another. Marketroom compares price, structure and holder rights
          across both.
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

      {example && <ContrastPanel view={example} />}
    </section>
  );
}

/**
 * One ticker, both instruments, side by side.
 *
 * Deliberately shows the rights that differ rather than a price chart: price
 * is the thing people already know how to find, and the rights are the thing
 * the product exists to surface.
 */
function ContrastPanel({ view }: { view: AssetView }) {
  const spread = venueSpread(view);

  return (
    <Link href={`/market/${view.asset.id}`} className="mr-contrast" prefetch>
      <div className="mr-contrast-head">
        <span>
          <span className="mr-num mr-contrast-ticker">{view.asset.symbol}</span>
          <span className="mr-contrast-name">{view.asset.name}</span>
        </span>
        {spread && (
          <Badge tone="warn" mono>
            {formatPercentAbs(spread.fraction)} apart
          </Badge>
        )}
      </div>

      <div className="mr-contrast-grid">
        {view.listings.map(({ listing, quote }) => {
          const change = quote ? priceChange24h(quote) : null;
          const rights = [
            ['Ownership', listing.rights.ownership],
            ['Dividends', listing.rights.dividends],
            ['Redeemable', listing.rights.redeemable],
          ] as const;

          return (
            <div key={listing.id} className="mr-contrast-side">
              <div className="mr-contrast-venue">
                <VenueBadge venue={listing.venue} />
                <InstrumentBadge kind={listing.kind} />
              </div>

              <div className="mr-num mr-contrast-price">{formatPrice(quote?.price ?? null)}</div>

              <div className="mr-contrast-rights">
                {rights.map(([label, has]) => (
                  <span key={label} className={has ? 'mr-right-yes' : 'mr-right-no'}>
                    <span aria-hidden="true">{has ? '✓' : '✕'}</span> {label}
                  </span>
                ))}
              </div>

              <p className="mr-contrast-note">
                {listing.kind === 'perpetual'
                  ? `Synthetic exposure at up to ${listing.maxLeverage}×. No shares are held.`
                  : 'Collateral-backed claim, redeemable with the issuer.'}
              </p>

              {/* The change is secondary here, but omitting it entirely would
                  make the panel look static beside a live table. */}
              {change && (
                <span className="mr-contrast-change">
                  {change.fraction >= 0 ? '▲' : '▼'} {formatPercentAbs(change.fraction)} 24h
                </span>
              )}
            </div>
          );
        })}
      </div>

      <span className="mr-contrast-cta">Compare in full →</span>
    </Link>
  );
}
