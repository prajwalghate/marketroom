'use client';

import type { AssetView, Candle, SortKey } from '@marketroom/core';
import {
  aggregateLiquidity,
  aggregateOpenInterest,
  aggregateVolume24h,
  consolidatedPrice,
  countryFlag,
  formatCompactUsd,
  formatPrice,
  primaryListing,
  priceChange24h,
  venueSpread,
} from '@marketroom/core';
import { Badge, PriceChange, Sparkline, VenueBadge } from '@marketroom/ui';
import Link from 'next/link';
import { memo } from 'react';
import { useLivePrices } from '@/lib/useLivePrices';

/**
 * The market table.
 *
 * Two performance decisions matter here and both are deliberate departures from
 * the reference, which re-rendered its entire grid via `innerHTML` on every
 * keystroke:
 *
 *  1. Rows are `memo`ised, so a live price tick on one row re-renders that row
 *     only — not the other 128.
 *  2. Live prices arrive through `useLivePrices`, which coalesces the websocket
 *     firehose into one update per animation frame.
 */

export interface MarketTableProps {
  assets: readonly AssetView[];
  sparklines: Record<string, Candle[]>;
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
}

interface Column {
  key: string;
  label: string;
  sort?: SortKey;
  /** The reverse-direction key, where core provides one. Enables a real toggle. */
  altSort?: SortKey;
  numeric?: boolean;
  hideOnMobile?: boolean;
  /** Dropped below 560px, where three columns are all that fit a phone. */
  hideOnPhone?: boolean;
}

const COLUMNS: Column[] = [
  { key: 'asset', label: 'Market', sort: 'symbol' },
  { key: 'price', label: 'Price', sort: 'price', numeric: true },
  { key: 'change', label: '24h', sort: 'change', altSort: 'changeAsc', numeric: true },
  { key: 'spark', label: '', hideOnMobile: true },
  { key: 'volume', label: 'Volume 24h', sort: 'volume', numeric: true, hideOnPhone: true },
  { key: 'oi', label: 'Open interest', sort: 'openInterest', numeric: true, hideOnMobile: true },
  { key: 'venues', label: 'Venues', sort: 'venues', hideOnMobile: true },
];

/**
 * Which way each sort key actually orders, so the header can state the truth.
 * Everything else in core sorts descending.
 */
const ASCENDING: ReadonlySet<SortKey> = new Set<SortKey>(['symbol', 'sector', 'changeAsc']);

export function MarketTable({ assets, sparklines, sort, onSortChange }: MarketTableProps) {
  const live = useLivePrices();

  return (
    <div className="mr-table-scroll">
      <table className="mr-table">
        {/* The table is the page's main content but had no accessible name, so
            it was announced only as "table". */}
        <caption className="sr-only">
          Tokenized equity markets, {assets.length} rows. Use the column headers to sort.
        </caption>
        <thead>
          <tr>
            {COLUMNS.map((column) => {
              const active = column.sort === sort || column.altSort === sort;
              const direction = ASCENDING.has(sort) ? 'ascending' : 'descending';

              return (
                <th
                  key={column.key}
                  className={[
                    column.numeric ? 'is-numeric' : '',
                    column.hideOnMobile ? 'mr-hide-sm' : '',
                    column.hideOnPhone ? 'mr-hide-xs' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-sort={column.sort ? (active ? direction : 'none') : undefined}
                >
                  {column.sort ? (
                    <button
                      type="button"
                      className="mr-sort-btn"
                      data-active={active}
                      /* Clicking the active column reverses it where core has a
                         reverse key; otherwise it re-applies the same sort. */
                      onClick={() =>
                        onSortChange(
                          active && column.altSort
                            ? sort === column.sort
                              ? column.altSort
                              : column.sort!
                            : column.sort!,
                        )
                      }
                    >
                      {column.label}
                      {active && (
                        <span aria-hidden="true">{direction === 'ascending' ? '↑' : '↓'}</span>
                      )}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {assets.map((view) => (
            <MarketRow
              key={view.asset.id}
              view={view}
              candles={sparklines[view.asset.id]}
              livePrice={livePriceFor(view, live)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Pick the live websocket price for this asset's primary Hyperliquid listing. */
function livePriceFor(view: AssetView, live: ReadonlyMap<string, number>): number | undefined {
  for (const { listing } of view.listings) {
    if (listing.venue !== 'hyperliquid') continue;
    const price = live.get(listing.venueSymbol);
    if (price !== undefined) return price;
  }
  return undefined;
}

interface MarketRowProps {
  view: AssetView;
  candles: Candle[] | undefined;
  livePrice: number | undefined;
}

/**
 * One row.
 *
 * `memo` is load-bearing: without it, every websocket frame would re-render the
 * entire table.
 */
const MarketRow = memo(function MarketRow({ view, candles, livePrice }: MarketRowProps) {
  const { asset } = view;
  const primary = primaryListing(view);
  const snapshotPrice = consolidatedPrice(view);

  // The websocket price supersedes the server snapshot the moment it arrives,
  // but the server value is already on screen — so there is never a blank cell.
  const price = livePrice ?? snapshotPrice;

  const change = primary?.quote ? priceChange24h(primary.quote) : null;
  const volume = aggregateVolume24h(view);
  const openInterest = aggregateOpenInterest(view);
  const liquidity = aggregateLiquidity(view);
  const spread = venueSpread(view);

  return (
    <tr>
      <td>
        <Link href={`/market/${asset.id}`} className="mr-row-link" prefetch>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div
                className="mr-market-id"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontWeight: 600,
                  color: 'var(--mr-text)',
                }}
              >
                <span className="mr-num">{asset.symbol}</span>
                {asset.country && (
                  <span aria-hidden="true" style={{ fontSize: 11 }}>
                    {countryFlag(asset.country)}
                  </span>
                )}
                {view.listings.length > 1 && (
                  <Badge tone="accent" title="Listed on more than one venue">
                    {view.listings.length} venues
                  </Badge>
                )}
              </div>
              {/* Truncation width lives in CSS because it has to change at
                  phone widths — an inline style cannot carry a media query. */}
              <div
                className="mr-market-name"
                style={{ fontSize: 'var(--mr-text-xs)', color: 'var(--mr-text-subtle)' }}
              >
                {asset.name}
              </div>
            </div>
          </div>
        </Link>
      </td>

      <td className="is-numeric mr-num" style={{ fontWeight: 500 }}>
        {formatPrice(price)}
      </td>

      <td className="is-numeric">
        <PriceChange fraction={change?.fraction ?? null} direction={change?.direction} />
      </td>

      <td className="mr-hide-sm" style={{ width: 96 }}>
        {/* Sparkline reserves an identical box when it has nothing to draw, so
            the row never reflows between a market with history and one without. */}
        <Sparkline candles={candles ?? []} direction={change?.direction} />
      </td>

      <td className="is-numeric mr-num mr-hide-xs" style={{ color: 'var(--mr-text-muted)' }}>
        {formatCompactUsd(volume)}
      </td>

      <td className="is-numeric mr-num mr-hide-sm" style={{ color: 'var(--mr-text-muted)' }}>
        {/* Perps report open interest; token listings report pool liquidity.
            Showing whichever exists is more honest than a column of dashes. */}
        {openInterest !== null ? formatCompactUsd(openInterest) : formatCompactUsd(liquidity)}
      </td>

      <td className="mr-hide-sm">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {view.listings.map(({ listing }) => (
            <VenueBadge key={listing.id} venue={listing.venue} compact />
          ))}
          {spread && spread.fraction > 0.005 && (
            <Badge
              tone="warn"
              mono
              title={`Price differs ${(spread.fraction * 100).toFixed(2)}% between venues`}
            >
              Δ{(spread.fraction * 100).toFixed(1)}%
            </Badge>
          )}
        </div>
      </td>
    </tr>
  );
});
