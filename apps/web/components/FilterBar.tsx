'use client';

import type { AssetClass, Facet, MarketFilters, SortKey, VenueId } from '@marketroom/core';
import { SORT_KEYS, SORT_LABELS, countryFlag } from '@marketroom/core';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useRef } from 'react';

/**
 * Market filters.
 *
 * The chips this replaces were real buttons with correct ARIA, but they read as
 * a wall of text rather than controls — nothing about an unfilled outline chip
 * in a long wrapped row says "this is a filter". The semantics were fine; the
 * affordance was not.
 *
 * So the two dimensions with a small fixed set of options — asset class and
 * venue — become segmented controls, which look like a control at a glance and
 * make the current selection obvious. Sector stays as chips because it has a
 * dozen values and no natural order, and country becomes a select because it
 * has thirteen and is a lookup rather than a browse.
 *
 * Asset class and venue are single-select here even though the underlying
 * filter accepts arrays. A segmented control that allows multiple selections
 * is a lie about its own shape; the URL still accepts a list, so a
 * multi-dimensional view remains expressible by link.
 */

export interface FilterBarProps {
  filters: MarketFilters;
  sort: SortKey;
  sectorFacets: readonly Facet[];
  countryFacets: readonly Facet[];
  classFacets: readonly Facet[];
  resultCount: number;
  totalCount: number;
  isDefault: boolean;
  onFiltersChange: (next: Partial<MarketFilters>) => void;
  onSortChange: (next: SortKey) => void;
  onReset: () => void;
}

/** Venue is presented as one question, not three independent toggles. */
type VenueChoice = 'all' | VenueId | 'multi';

const VENUE_CHOICES: { id: VenueChoice; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'hyperliquid', label: 'Hyperliquid' },
  { id: 'solana', label: 'Solana' },
  { id: 'multi', label: 'Multi-venue' },
];

function currentVenue(filters: MarketFilters): VenueChoice {
  if (filters.multiVenueOnly) return 'multi';
  if (filters.venues.length === 1) return filters.venues[0] as VenueId;
  return 'all';
}

function venuePatch(choice: VenueChoice): Partial<MarketFilters> {
  if (choice === 'multi') return { venues: [], multiVenueOnly: true };
  if (choice === 'all') return { venues: [], multiVenueOnly: false };
  return { venues: [choice], multiVenueOnly: false };
}

export function FilterBar({
  filters,
  sort,
  sectorFacets,
  countryFacets,
  classFacets,
  resultCount,
  totalCount,
  isDefault,
  onFiltersChange,
  onSortChange,
  onReset,
}: FilterBarProps) {
  const activeClass: AssetClass | 'all' =
    filters.assetClasses.length === 1 ? (filters.assetClasses[0] as AssetClass) : 'all';
  const activeVenue = currentVenue(filters);
  const activeCountry = filters.countries[0] ?? '';

  return (
    <div className="mr-filters">
      <div className="mr-filter-top">
        <label className="mr-field">
          <span className="mr-field-label">Sort</span>
          <select
            className="mr-select"
            value={sort}
            onChange={(event) => onSortChange(event.target.value as SortKey)}
            aria-label="Sort markets"
          >
            {SORT_KEYS.filter((key) => key !== 'relevance' || sort === 'relevance').map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ── Segmented dimensions ──────────────────────────────────────── */}
      <div className="mr-filter-row">
        <Segmented
          label="Class"
          value={activeClass}
          options={[
            { id: 'all', label: 'All' },
            ...classFacets.map((facet) => ({
              id: facet.value,
              label: facet.value,
              count: facet.count,
            })),
          ]}
          onChange={(id) =>
            onFiltersChange({ assetClasses: id === 'all' ? [] : [id as AssetClass] })
          }
        />

        <Segmented
          label="Venue"
          value={activeVenue}
          options={VENUE_CHOICES}
          onChange={(id) => onFiltersChange(venuePatch(id as VenueChoice))}
        />

        <label className="mr-field">
          <span className="mr-field-label">Country</span>
          <select
            className="mr-select"
            value={activeCountry}
            onChange={(event) =>
              onFiltersChange({ countries: event.target.value ? [event.target.value] : [] })
            }
            aria-label="Filter by country"
          >
            <option value="">All countries</option>
            {countryFacets.map((facet) => (
              <option key={facet.value} value={facet.value}>
                {countryFlag(facet.value)} {facet.value} ({facet.count})
              </option>
            ))}
          </select>
        </label>

        {!isDefault && (
          <button type="button" className="mr-btn mr-filter-clear" onClick={onReset}>
            Clear all
          </button>
        )}
      </div>

      {/* ── Sector ────────────────────────────────────────────────────── */}
      {/* Chips rather than a segmented control: a dozen values with no natural
          order would make a segmented control wrap into an unreadable block. */}
      <div className="mr-filter-row" role="group" aria-label="Filter by sector">
        <span className="mr-field-label mr-sector-label">Sector</span>
        <div className="mr-sector-chips">
          {sectorFacets.slice(0, 12).map((facet) => {
            const on = filters.sectors.includes(facet.value);
            return (
              <button
                key={facet.value}
                type="button"
                className="mr-chip"
                aria-pressed={on}
                aria-label={`${facet.value}, ${facet.count} markets`}
                onClick={() =>
                  onFiltersChange({
                    sectors: on
                      ? filters.sectors.filter((s) => s !== facet.value)
                      : [...filters.sectors, facet.value],
                  })
                }
              >
                <span aria-hidden="true">{facet.value}</span>
                <span className="mr-chip-count" aria-hidden="true">
                  {facet.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mr-result-count" aria-live="polite" aria-atomic="true">
        {resultCount === totalCount
          ? `${totalCount} markets`
          : `${resultCount} of ${totalCount} markets`}
      </p>
    </div>
  );
}

interface SegmentOption {
  id: string;
  label: string;
  count?: number;
}

/**
 * A segmented control.
 *
 * `radiogroup` rather than a row of buttons, because the options are mutually
 * exclusive and that is what tells assistive tech so. Claiming the role means
 * owing its keyboard contract, which a row of plain buttons does not provide
 * for free:
 *
 *  - **Roving tabindex.** The group is one tab stop, not one per option.
 *    Without it, Class and Venue cost twelve stops between the search box and
 *    the table.
 *  - **Arrow keys move and select.** Native radios behave this way, so a
 *    screen-reader user following the pattern presses an arrow and expects
 *    something to happen.
 *
 * Both were missing when this shipped: arrows did nothing and every option was
 * tabbable. axe reports no violation for either — it checks that roles are
 * used validly, not that their behaviour exists.
 */
function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly SegmentOption[];
  onChange: (id: string) => void;
}): ReactNode {
  const groupRef = useRef<HTMLDivElement>(null);
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.id === value),
  );

  const move = (delta: number) => {
    const buttons = [
      ...(groupRef.current?.querySelectorAll<HTMLButtonElement>('.mr-segment') ?? []),
    ];
    // Derived from what is focused *now*, not from the `value` prop. Holding an
    // arrow key outruns the re-render, and reading a stale prop made every
    // second press move focus without selecting.
    const from = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const current = from === -1 ? activeIndex : from;

    const next = (current + delta + options.length) % options.length;
    const option = options[next];
    if (!option) return;

    onChange(option.id);
    // Focus follows selection, as it does for native radios.
    buttons[next]?.focus();
  };

  const moveTo = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.id);
    groupRef.current?.querySelectorAll<HTMLButtonElement>('.mr-segment')[index]?.focus();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        moveTo(0);
        break;
      case 'End':
        event.preventDefault();
        moveTo(options.length - 1);
        break;
      default:
    }
  };

  return (
    <div className="mr-field">
      <span className="mr-field-label" id={`seg-${label}`}>
        {label}
      </span>
      <div
        ref={groupRef}
        className="mr-segmented"
        role="radiogroup"
        aria-labelledby={`seg-${label}`}
        onKeyDown={onKeyDown}
      >
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={value === option.id}
            // Roving tabindex: only the selected option is a tab stop.
            tabIndex={index === activeIndex ? 0 : -1}
            className="mr-segment"
            onClick={() => onChange(option.id)}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="mr-segment-count" aria-hidden="true">
                {option.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
