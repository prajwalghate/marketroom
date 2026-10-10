import Link from 'next/link';
import type { ReactNode } from 'react';
import { hrefWith, one, type Params } from '@/lib/query';

/**
 * Directory filters. Every option is a link to the view it produces, so the
 * filters work without JavaScript, the back button undoes them, and any view
 * can be shared by copying the address.
 */

export interface FacetOption {
  readonly value: string;
  readonly label: string;
  readonly count?: number;
}

export function FacetGroup({
  title,
  param,
  options,
  base,
  params,
  limit = 8,
  max = 40,
  open,
}: {
  title: string;
  param: string;
  options: readonly FacetOption[];
  base: string;
  params: Params;
  limit?: number;
  /** Options beyond this many are left to search: hundreds of links help no one. */
  max?: number;
  open?: boolean;
}) {
  const current = one(params[param]);
  const capped = options.length > max;
  options = options.slice(0, max);
  const selected = options.find((o) => o.value === current);
  const top = options.slice(0, limit);
  // A selected option outside the top list still shows, so it can be cleared.
  if (current && !top.some((o) => o.value === current))
    top.push(selected ?? { value: current, label: current });
  const rest = options.slice(limit).filter((o) => o.value !== current);
  const option = (o: FacetOption) => {
    const on = o.value === current;
    return (
      <Link
        key={o.value}
        href={hrefWith(base, params, { [param]: on ? null : o.value })}
        className={on ? 'rx-option is-on' : 'rx-option'}
        aria-current={on ? 'true' : undefined}
        prefetch={false}
      >
        <span className="rx-option-box" aria-hidden="true" />
        <span className="rx-option-label">{o.label}</span>
        {o.count !== undefined && <span className="rx-option-count">{o.count}</span>}
      </Link>
    );
  };
  return (
    <details className="rx-filter" open={open ?? true}>
      <summary>
        {title}
        {selected && <span className="rx-filter-current">{selected.label}</span>}
      </summary>
      <div className="rx-filter-options">
        {top.length === 0 ? (
          <span className="rx-muted rx-filter-none">Nothing to filter yet</span>
        ) : (
          top.map(option)
        )}
        {rest.length > 0 && (
          <details className="rx-filter-more">
            <summary>Show {rest.length} more</summary>
            {rest.map(option)}
            {capped && (
              <span className="rx-muted rx-filter-none">
                The {max} most common; search for the rest.
              </span>
            )}
          </details>
        )}
      </div>
    </details>
  );
}

/** The free-text search at the top of a directory, keeping the other filters. */
export function SearchBox({
  base,
  params,
  placeholder,
  label,
}: {
  base: string;
  params: Params;
  placeholder: string;
  label: string;
}) {
  const keep = Object.entries(params).filter(([k, v]) => k !== 'q' && k !== 'page' && one(v));
  return (
    <form action={base} method="get" role="search" className="rx-dbsearch">
      <label htmlFor={`${base.slice(1)}-q`} className="sr-only">
        {label}
      </label>
      <input
        id={`${base.slice(1)}-q`}
        name="q"
        type="search"
        defaultValue={one(params.q)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {keep.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={one(v)} />
      ))}
      <button type="submit" className="mr-btn">
        Search
      </button>
    </form>
  );
}

/** Active filters as removable chips, plus "clear all". */
export function ActiveFilters({
  base,
  params,
  labels,
}: {
  base: string;
  params: Params;
  labels: Record<string, (value: string) => string | null>;
}) {
  const active = Object.keys(labels)
    .map((k) => ({ key: k, value: one(params[k]) }))
    .filter((a) => a.value);
  if (active.length === 0) return null;
  return (
    <div className="rx-active">
      {active.map((a) => (
        <Link
          key={a.key}
          href={hrefWith(base, params, { [a.key]: null })}
          className="rx-chip is-filter"
          prefetch={false}
          aria-label={`Remove filter: ${labels[a.key]!(a.value) ?? a.value}`}
        >
          {labels[a.key]!(a.value) ?? a.value} <span aria-hidden="true">×</span>
        </Link>
      ))}
      <Link href={base} className="rx-clear" prefetch={false}>
        Clear all
      </Link>
    </div>
  );
}

/** A column heading that sorts by its column. */
export function SortHeader({
  base,
  params,
  sort,
  current,
  children,
  numeric,
}: {
  base: string;
  params: Params;
  sort: string;
  current: string;
  children: ReactNode;
  numeric?: boolean;
}) {
  const on = sort === current;
  return (
    <th className={numeric ? 'is-num' : undefined} aria-sort={on ? 'descending' : undefined}>
      <Link
        href={hrefWith(base, params, { sort })}
        className="rx-sort"
        aria-current={on ? 'true' : undefined}
        prefetch={false}
      >
        {children}
        {on && <span aria-hidden="true"> ↓</span>}
      </Link>
    </th>
  );
}
