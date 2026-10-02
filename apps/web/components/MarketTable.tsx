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
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useRouter } from 'next/navigation';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLivePrices } from '@/lib/useLivePrices';

/**
 * The market table.
 *
 * Two performance decisions matter here, because the naive version of this
 * table re-renders every row on every keystroke and every price tick:
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
  const router = useRouter();

  /**
   * Whole-row navigation, by delegation.
   *
   * This used to be a stretched `.mr-row-link::after { inset: 0 }`, which is the
   * usual trick — and it is quietly broken. An absolutely positioned overlay
   * resolves against its nearest *positioned ancestor*, and `position: relative`
   * on a `<tr>` is not honoured by every browser. Where it is ignored the
   * overlay escapes to the initial containing block and covers the entire page,
   * so every click anywhere — filters, search, nav — lands on whichever row
   * painted last. It looks fine in one browser and bricks the page in another.
   *
   * One delegated handler instead: no overlay, no containing-block assumption,
   * identical behaviour everywhere. The real `<a>` stays in the first cell, so
   * keyboard, middle-click, "open in new tab" and screen readers are unaffected,
   * and modified clicks are handed back to the browser.
   */
  const handleRowClick = (event: ReactMouseEvent<HTMLTableSectionElement>) => {
    const target = event.target as HTMLElement | null;
    // Anything genuinely interactive handles its own click.
    if (target?.closest('a, button, input, select, textarea, [role="button"]')) return;
    // Let the browser own modified clicks (new tab, new window, download).
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
      return;
    // Never hijack a click that was really a text selection.
    if (window.getSelection()?.toString()) return;

    const id = target?.closest('tr')?.dataset.assetId;
    if (id) router.push(`/market/${id}`);
  };

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
                  data-col={column.key}
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
        <VirtualBody
          assets={assets}
          sparklines={sparklines}
          live={live}
          onRowClick={handleRowClick}
        />
      </table>
    </div>
  );
}

/**
 * Only window once the list is long enough to pay for it. Below this a table
 * renders in well under a frame, and windowing would add scroll machinery for
 * nothing.
 */
const VIRTUALIZE_ABOVE = 50;

/** Fallback row height, replaced by real measurements as rows render. */
const ESTIMATED_ROW_HEIGHT = 57;

/** Rows rendered beyond the viewport, so a fast scroll does not reach blank space. */
const OVERSCAN = 12;

/**
 * The table body, windowed.
 *
 * Three constraints shaped this:
 *
 *  1. **It must not own the scrollbar.** Scrolling an inner container would
 *     make it the containing block for `position: sticky` and break the header
 *     — the same trap that `overflow-x: auto` set earlier. So this virtualizes
 *     against the *window*, and the page keeps one scrollbar.
 *
 *  2. **The server must still render every row.** The first paint has to be
 *     complete — for crawlers, for a shared filtered link, and because
 *     rendering a window server-side means guessing a viewport height. So
 *     `mounted` gates the windowing: the server and the first client render
 *     emit all rows (no hydration mismatch), and windowing takes over on the
 *     next tick.
 *
 *  3. **Row heights vary.** A two-line stacked row on a phone is ~82px, a
 *     desktop row ~46px, so heights are measured rather than assumed.
 *
 * Known trade-off: find-in-page only finds rendered rows. The app's own search
 * covers the whole dataset and is the better tool here, but it is a real
 * regression for anyone who reaches for Ctrl+F.
 */
interface BodyProps {
  assets: readonly AssetView[];
  sparklines: Record<string, Candle[]>;
  live: ReadonlyMap<string, number>;
  onRowClick: (event: ReactMouseEvent<HTMLTableSectionElement>) => void;
}

/**
 * The table body.
 *
 * Short lists render whole; long ones window. The split is a component
 * boundary rather than a branch inside one, because the virtualizer needs the
 * body's document offset to compute its range, and that offset is only
 * knowable after the element exists. Mounting a dedicated component lets it be
 * measured in a layout effect before the first windowed paint, instead of being
 * read as `null` during the first render and silently pinning the window to the
 * top of the list.
 */
function VirtualBody({ assets, sparklines, live, onRowClick }: BodyProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The server, and the first client render, emit every row: the first paint
  // has to be complete for crawlers and for shared filtered links, and
  // rendering a window server-side would mean guessing a viewport height.
  // Matching markup on both sides also keeps hydration clean.
  if (!mounted || assets.length <= VIRTUALIZE_ABOVE) {
    return (
      <PlainBody assets={assets} sparklines={sparklines} live={live} onRowClick={onRowClick} />
    );
  }
  return (
    <WindowedBody assets={assets} sparklines={sparklines} live={live} onRowClick={onRowClick} />
  );
}

function PlainBody({ assets, sparklines, live, onRowClick }: BodyProps) {
  return (
    <tbody onClick={onRowClick}>
      {assets.map((view) => (
        <MarketRow
          key={view.asset.id}
          view={view}
          candles={sparklines[view.asset.id]}
          livePrice={livePriceFor(view, live)}
        />
      ))}
    </tbody>
  );
}

/**
 * Windowed body.
 *
 * Virtualizes against the *window*, not an inner scroller. An inner scroll
 * container would become the containing block for `position: sticky` and break
 * the table header — the same trap `overflow-x: auto` set earlier — and would
 * give the page two scrollbars.
 *
 * Known trade-off: find-in-page only reaches rendered rows. The app's own
 * search covers the whole dataset and is the better tool here, but this is a
 * real regression for anyone who reaches for Ctrl+F.
 */
function WindowedBody({ assets, sparklines, live, onRowClick }: BodyProps) {
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Where the body starts in the document. Without it every range is measured
  // from the top of the page, so the window stays pinned to the first rows
  // however far the reader scrolls. Re-measured on resize because the filter
  // chips above reflow and change the offset.
  useLayoutEffect(() => {
    const measure = () => {
      const node = bodyRef.current;
      if (node) setScrollMargin(node.getBoundingClientRect().top + window.scrollY);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: assets.length,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN,
    scrollMargin,
  });

  const items = virtualizer.getVirtualItems();
  const first = items[0];
  const last = items[items.length - 1];

  // Spacer rows stand in for what is not rendered, so the scrollbar keeps its
  // true length. Transforms are not an option: a transformed `<tr>` is not
  // reliably laid out inside a table.
  const padTop = first ? first.start - scrollMargin : 0;
  const padBottom = last ? virtualizer.getTotalSize() - last.end : 0;

  return (
    <tbody ref={bodyRef} onClick={onRowClick}>
      {padTop > 0 && (
        <tr aria-hidden="true" style={{ height: padTop }}>
          <td colSpan={COLUMNS.length} style={{ padding: 0, border: 'none' }} />
        </tr>
      )}

      {items.map((item) => {
        const view = assets[item.index];
        if (!view) return null;
        return (
          <MarketRow
            key={view.asset.id}
            view={view}
            candles={sparklines[view.asset.id]}
            livePrice={livePriceFor(view, live)}
            // Feeds real heights back, so a two-line phone row and a one-line
            // desktop row both converge off the same estimate.
            measureRef={virtualizer.measureElement}
            index={item.index}
          />
        );
      })}

      {padBottom > 0 && (
        <tr aria-hidden="true" style={{ height: padBottom }}>
          <td colSpan={COLUMNS.length} style={{ padding: 0, border: 'none' }} />
        </tr>
      )}
    </tbody>
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
  /** Supplied only while windowing, so the virtualizer can measure real heights. */
  measureRef?: (node: Element | null) => void;
  index?: number;
}

/**
 * One row.
 *
 * `memo` is load-bearing: without it, every websocket frame would re-render the
 * entire table.
 */
const MarketRow = memo(function MarketRow({
  view,
  candles,
  livePrice,
  measureRef,
  index,
}: MarketRowProps) {
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
    <tr ref={measureRef} data-index={index} data-asset-id={asset.id}>
      <td data-col="asset">
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

      <td data-col="price" className="is-numeric mr-num" style={{ fontWeight: 500 }}>
        {formatPrice(price)}
      </td>

      <td data-col="change" className="is-numeric">
        <PriceChange fraction={change?.fraction ?? null} direction={change?.direction} />
      </td>

      <td data-col="spark" className="mr-hide-sm" style={{ width: 96 }}>
        {/* Sparkline reserves an identical box when it has nothing to draw, so
            the row never reflows between a market with history and one without. */}
        <Sparkline candles={candles ?? []} direction={change?.direction} />
      </td>

      <td
        data-col="volume"
        className="is-numeric mr-num mr-hide-xs"
        style={{ color: 'var(--mr-text-muted)' }}
      >
        {formatCompactUsd(volume)}
      </td>

      <td
        data-col="oi"
        className="is-numeric mr-num mr-hide-sm"
        style={{ color: 'var(--mr-text-muted)' }}
      >
        {/* Perps report open interest; token listings report pool liquidity.
            Showing whichever exists is more honest than a column of dashes. */}
        {openInterest !== null ? formatCompactUsd(openInterest) : formatCompactUsd(liquidity)}
      </td>

      <td data-col="venues" className="mr-hide-sm">
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
