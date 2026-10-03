'use client';

import type { AssetView } from '@marketroom/core';
import {
  EMPTY_FILTERS,
  aggregateVolume24h,
  countryFlag,
  formatCompactUsd,
  formatPrice,
  primaryListing,
  priceChange24h,
  selectAssets,
} from '@marketroom/core';
import { PriceChange } from '@marketroom/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * Market search, as a combobox with results anchored to the field.
 *
 * This replaces a plain input whose matches only ever appeared in the table
 * ~780px further down the page — past the fold, so typing produced no visible
 * response at all. The input had been moved into the hero to fill a layout
 * gap; that fixed the spacing and broke the interaction, separating the
 * control from its one consequence.
 *
 * The panel puts them back together: a keystroke and its result occupy the
 * same place on screen. Picking a result goes straight to that market, and
 * filtering the table below stays available behind an explicit "see all".
 *
 * On "loading": this searches an in-memory list, so there is no request to
 * wait for, and a spinner on a local array would be theatre. `useDeferredValue`
 * gives a *real* pending signal instead — React keeps the field responsive and
 * tells us when the list render is genuinely still behind. On a short query
 * over a few hundred rows that is never, so the skeleton correctly never shows.
 */

/** Matches shown in the panel. Past this, "see all" takes over. */
const MAX_VISIBLE = 7;

/** Shown before anything is typed, as the busiest markets. */
const IDLE_SUGGESTIONS = 5;

export interface MarketSearchProps {
  assets: readonly AssetView[];
  query: string;
  onQueryChange: (value: string) => void;
  /** Commits the query to the table below and dismisses the panel. */
  onSeeAll: () => void;
  /**
   * Called immediately before this component routes to a market.
   *
   * Not optional, because forgetting it is silent and wrong: any debounced
   * side effect the owner has scheduled against *this* page — a URL write, a
   * fetch — will land after the reader has already left, and a debounced
   * `router.replace` in particular will drag them straight back here.
   */
  onNavigateAway: () => void;
}

export function MarketSearch({
  assets,
  query,
  onQueryChange,
  onSeeAll,
  onNavigateAway,
}: MarketSearchProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = useCallback((index: number) => `${baseId}-opt-${index}`, [baseId]);

  // Keeps typing responsive while the list catches up, and reports honestly
  // when it has not caught up yet.
  const deferredQuery = useDeferredValue(query);
  const isPending = query !== deferredQuery;
  const trimmed = deferredQuery.trim();

  const matches = useMemo(() => {
    if (assets.length === 0) return [];
    if (!trimmed) {
      return [...assets]
        .sort((a, b) => (aggregateVolume24h(b) ?? 0) - (aggregateVolume24h(a) ?? 0))
        .slice(0, IDLE_SUGGESTIONS);
    }
    return selectAssets(assets, {
      filters: { ...EMPTY_FILTERS, query: trimmed },
      sort: 'relevance',
    });
  }, [assets, trimmed]);

  const visible = matches.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, matches.length - visible.length);

  // An empty universe is the one error this can actually have: it means the
  // venues could not be reached, not that nothing matched the query.
  const errored = assets.length === 0;
  const showSkeleton = !errored && isPending && trimmed.length > 0;
  const showList = !errored && !showSkeleton && visible.length > 0;
  const showEmpty = !errored && !showSkeleton && visible.length === 0;

  // Whether a listbox popup actually exists right now.
  //
  // This drives `aria-expanded` as well as `aria-controls`, and the two must
  // agree. Reporting expanded while the panel holds only a message left a
  // `combobox` claiming a popup it could not name — axe flags that as a
  // critical `aria-required-attr` failure, and it is genuinely misleading: a
  // screen-reader user is told a list opened and then finds nothing to
  // navigate. The message reaches them through the live region instead.
  const listLive = open && showList;

  // Drop the highlight whenever the result set changes underneath it.
  useEffect(() => setActiveIndex(-1), [trimmed]);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const go = useCallback(
    (view: AssetView) => {
      close();
      // Before the push, not after: a pending write that fires mid-navigation
      // replaces the URL we are navigating to.
      onNavigateAway();
      router.push(`/market/${view.asset.id}`);
    },
    [close, onNavigateAway, router],
  );

  const seeAll = useCallback(() => {
    close();
    onSeeAll();
    // Focus returns to the field, so a keyboard user is not left stranded on a
    // control that just disappeared.
    inputRef.current?.focus();
  }, [close, onSeeAll]);

  // Dismiss on an outside press. `pointerdown`, not `click`, so the panel is
  // gone before the click lands on whatever was underneath it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  // Keep the highlighted option in view when arrowing past the panel's edge.
  // Indexing children rather than querying by id: `useId` values contain
  // characters that are not valid in a selector unescaped.
  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const count = visible.length;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) setOpen(true);
        else if (count > 0) setActiveIndex((i) => (i + 1) % count);
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (!open) setOpen(true);
        else if (count > 0) setActiveIndex((i) => (i <= 0 ? count - 1 : i - 1));
        break;

      case 'Home':
        if (open && count > 0) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;

      case 'End':
        if (open && count > 0) {
          event.preventDefault();
          setActiveIndex(count - 1);
        }
        break;

      case 'Enter': {
        const picked = activeIndex >= 0 ? visible[activeIndex] : undefined;
        if (picked) {
          event.preventDefault();
          go(picked);
        } else if (trimmed) {
          event.preventDefault();
          seeAll();
        }
        break;
      }

      case 'Escape':
        event.preventDefault();
        // First Escape dismisses the panel, a second clears the field. Clearing
        // on the first press would throw away a query someone is part-way
        // through refining.
        if (open) close();
        else if (query) onQueryChange('');
        break;

      case 'Tab':
        close();
        break;

      default:
    }
  };

  const status = errored
    ? 'Market data is unavailable.'
    : !trimmed
      ? ''
      : showSkeleton
        ? ''
        : matches.length === 0
          ? `No markets match ${trimmed}.`
          : `${matches.length} market${matches.length === 1 ? '' : 's'} match ${trimmed}.`;

  return (
    <div className="mr-combo" ref={rootRef}>
      <span aria-hidden="true" className="mr-combo-icon">
        ⌕
      </span>

      <input
        ref={inputRef}
        className="mr-input mr-combo-input"
        type="search"
        value={query}
        role="combobox"
        aria-expanded={listLive}
        aria-controls={listLive ? listboxId : undefined}
        aria-activedescendant={listLive && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-autocomplete="list"
        aria-label="Search markets"
        placeholder="Search ticker, company, sector or mint…"
        autoComplete="off"
        onChange={(event) => {
          onQueryChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {/* Announced but not shown: the panel already states this visually, and
          repeating it on screen would be noise. Always mounted, because a live
          region added at the same time as its text does not get announced. */}
      <span className="sr-only" role="status">
        {open ? status : ''}
      </span>

      {open && (
        <div className="mr-combo-panel">
          {errored ? (
            <p className="mr-combo-note">
              Market data is unavailable right now. Search will work once the venues respond.
            </p>
          ) : showSkeleton ? (
            <ul className="mr-combo-list" aria-hidden="true">
              {[0, 1, 2].map((row) => (
                <li key={row} className="mr-combo-skeleton">
                  <span />
                  <span />
                </li>
              ))}
            </ul>
          ) : showEmpty ? (
            <p className="mr-combo-note">
              No markets match <strong>{trimmed}</strong>. Try a ticker, a company name, a sector or
              a Solana mint address.
            </p>
          ) : (
            <>
              {!trimmed && <p className="mr-combo-head">Most traded</p>}

              <ul className="mr-combo-list" role="listbox" id={listboxId} ref={listRef}>
                {visible.map((view, index) => (
                  <Option
                    key={view.asset.id}
                    view={view}
                    query={trimmed}
                    id={optionId(index)}
                    active={index === activeIndex}
                    onHover={() => setActiveIndex(index)}
                    onPick={() => go(view)}
                  />
                ))}
              </ul>

              {trimmed && (
                <button
                  type="button"
                  className="mr-combo-all"
                  // Blocks the blur that would otherwise close the panel before
                  // the click resolves.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={seeAll}
                >
                  {overflow > 0
                    ? `See all ${matches.length} results`
                    : `Show ${matches.length === 1 ? 'this' : 'these'} in the market table`}
                  <span aria-hidden="true"> →</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Option({
  view,
  query,
  id,
  active,
  onHover,
  onPick,
}: {
  view: AssetView;
  query: string;
  id: string;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const primary = primaryListing(view);
  const change = primary?.quote ? priceChange24h(primary.quote) : null;

  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      className={active ? 'mr-combo-option is-active' : 'mr-combo-option'}
      onMouseEnter={onHover}
      // `mousedown` fires before the input's blur, so the pick is not lost to
      // the panel closing from under the pointer.
      onMouseDown={(event) => {
        event.preventDefault();
        onPick();
      }}
    >
      {/* Two lines rather than one. On a single line the ticker, name, price,
          change and volume all competed for 460px and the company name lost —
          "NVIDIA Corporat…". Stacking identity over detail is also how every
          serious ticker search presents a result, and it scans faster. */}
      <span className="mr-combo-id">
        <span className="mr-combo-line">
          <span className="mr-num mr-combo-ticker">
            <Highlight text={view.asset.symbol} query={query} />
          </span>
          {view.asset.country && (
            <span aria-hidden="true" className="mr-combo-flag">
              {countryFlag(view.asset.country)}
            </span>
          )}
          {view.listings.length > 1 && (
            <span className="mr-combo-venues">{view.listings.length} venues</span>
          )}
        </span>
        <span className="mr-combo-name">
          <Highlight text={view.asset.name} query={query} />
        </span>
      </span>

      <span className="mr-combo-figures">
        <span className="mr-num mr-combo-price">{formatPrice(primary?.quote?.price ?? null)}</span>
        <span className="mr-combo-line mr-combo-sub">
          {/* The shared component, not a hand-rolled span. The first version
              here reused `.mr-right-yes`/`.mr-right-no` — which mean "this
              listing does / does not confer that right", not a price
              direction. A falling price rendered grey rather than red, and the
              grey failed contrast on the highlighted row. */}
          <PriceChange
            fraction={change?.fraction ?? null}
            direction={change?.direction}
            size="sm"
          />
          <span className="mr-num mr-combo-vol">{formatCompactUsd(aggregateVolume24h(view))}</span>
        </span>
      </span>
    </li>
  );
}

/**
 * Marks the matched run inside a result.
 *
 * Case-insensitive and literal — the query is escaped before it reaches a
 * regular expression, so a stray `(` typed into the field cannot throw.
 */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'));

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={index} className="mr-combo-mark">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}
