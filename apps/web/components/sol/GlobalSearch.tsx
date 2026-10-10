'use client';

import { formatPercentAdaptive, formatPrice } from '@marketroom/core';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { colorFor } from '@/components/charts/palette';
import { Avatar } from './Avatar';

export type SearchType = 'project' | 'person' | 'investor' | 'token' | 'program';

export interface Hit {
  type: SearchType;
  key: string;
  name: string;
  imageUrl: string | null;
  detail: string | null;
  href: string;
  category?: string | null;
  symbol?: string | null;
  price?: number | null;
  change24h?: number | null;
}

export type Counts = Record<SearchType, number>;

const GROUP: Record<SearchType, string> = {
  project: 'Projects',
  investor: 'Investors',
  person: 'People',
  token: 'Tokens',
  program: 'Programs',
};

/**
 * Search the database as the reader types: debounced, and each new query
 * cancels the one before, so results never arrive out of order.
 */
export function useSearch(
  query: string,
  types?: readonly SearchType[],
  { limit = 5, counts: withCounts = false }: { limit?: number; counts?: boolean } = {},
) {
  const [hits, setHits] = useState<Hit[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(false);
  const typeParam = types?.join(',') ?? '';

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      setCounts(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      // Same-origin, to our own route — the adapters rule is about upstream APIs.
      // eslint-disable-next-line no-restricted-globals
      fetch(
        `/api/v1/search?q=${encodeURIComponent(q)}${typeParam ? `&types=${typeParam}` : ''}&limit=${limit}${withCounts ? '&counts=1' : ''}`,
        {
          signal: controller.signal,
        },
      )
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d: { results: Hit[]; counts?: Counts }) => {
          setHits(d.results);
          setCounts(d.counts ?? null);
          setLoading(false);
        })
        .catch((e: unknown) => {
          if ((e as Error).name !== 'AbortError') setLoading(false);
        });
    }, 140);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, typeParam, limit, withCounts]);

  return { hits, loading, counts };
}

const ORDER: readonly SearchType[] = ['project', 'token', 'investor', 'person', 'program'];

const TABS: { id: SearchType | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'project', label: 'Projects' },
  { id: 'token', label: 'Tokens' },
  { id: 'investor', label: 'Investors' },
  { id: 'person', label: 'People' },
  { id: 'program', label: 'Programs' },
];

/** One result: logo, name, ticker and category, a line of detail, and a price for tokens. */
export function HitRow({ hit }: { hit: Hit }) {
  return (
    <span className="rx-search-row">
      <Avatar
        src={hit.imageUrl}
        name={hit.name}
        size={30}
        shape={hit.type === 'person' ? 'round' : 'square'}
      />
      <span className="rx-search-name">
        <span className="rx-search-title">{hit.name}</span>
        {hit.symbol && hit.symbol !== hit.name && (
          <span className="rx-search-sym mr-num">{hit.symbol}</span>
        )}
        {hit.category && (
          <span className="rx-search-cat">
            <span
              className="rx-tag-dot"
              style={{ background: colorFor(hit.category) }}
              aria-hidden="true"
            />
            {hit.category}
          </span>
        )}
      </span>
      {hit.detail && (
        <span className="rx-search-detail">
          {hit.category && hit.detail.startsWith(`${hit.category} · `)
            ? hit.detail.slice(hit.category.length + 3)
            : hit.detail === hit.category
              ? null
              : hit.detail}
        </span>
      )}
      {hit.price != null && (
        <span className="rx-search-quote mr-num">
          <span>{formatPrice(hit.price)}</span>
          {hit.change24h != null && (
            <span className={hit.change24h >= 0 ? 'rx-up' : 'rx-down'}>
              {formatPercentAdaptive(hit.change24h, { signed: true })}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/**
 * Header search across projects, investors, people, tokens and programs.
 *
 * The ARIA 1.2 combobox pattern: the input owns a listbox, the active option
 * is announced through `aria-activedescendant`, and focus never leaves the
 * input — so typing, arrowing and choosing are one continuous gesture.
 * Enter with nothing highlighted opens the full results page.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [tab, setTab] = useState<SearchType | 'all'>('all');
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const found = useSearch(query, tab === 'all' ? undefined : [tab], {
    limit: tab === 'all' ? 4 : 12,
    counts: true,
  });
  const { loading, counts } = found;
  // Relevance across record types is not comparable (value locked against
  // transactions an hour), so "All" groups by type in a fixed order and keeps
  // the ranking within each group.
  const hits = useMemo(
    () =>
      tab === 'all'
        ? ORDER.flatMap((t) => found.hits.filter((h) => h.type === t))
        : // Until the tab's own results arrive, keep only what already fits it.
          found.hits.filter((h) => h.type === tab),
    [found.hits, tab],
  );

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery('');
      setTab('all');
      router.push(href);
    },
    [router],
  );

  const all = `/search?q=${encodeURIComponent(query.trim())}${tab === 'all' ? '' : `&type=${tab}`}`;
  const total = counts ? Object.values(counts).reduce((s, n) => s + n, 0) : null;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(hits.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === 'Enter') {
      if (!query.trim()) return;
      e.preventDefault();
      go(open && active >= 0 && hits[active] ? hits[active].href : all);
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      } else {
        setQuery('');
      }
    }
  };

  const showList = open && query.trim().length > 0;

  return (
    <div className="rx-search is-header" ref={wrapRef}>
      <input
        type="search"
        className="rx-search-input"
        placeholder="Search projects, people, investors, tokens…"
        aria-label="Search projects, people, investors, tokens and programs"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && active >= 0 && hits[active] ? `${listId}-${active}` : undefined
        }
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <div className="rx-search-panel">
          <div className="rx-search-tabs" role="group" aria-label="Show results for">
            {TABS.map((t) => {
              const n = counts ? (t.id === 'all' ? total : counts[t.id]) : null;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={tab === t.id}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setTab(t.id);
                    setActive(-1);
                  }}
                >
                  {t.label}
                  {n !== null && <span className="rx-search-tabn mr-num">{n}</span>}
                </button>
              );
            })}
          </div>
          {/* A listbox holds options only; how the search is going is said beside it. */}
          {hits.length === 0 && (
            <p className={loading ? 'rx-search-loading' : 'rx-search-note'} role="status">
              {loading ? 'Searching…' : `Nothing matches “${query.trim()}”.`}
            </p>
          )}
          <ul
            id={listId}
            role="listbox"
            className="rx-search-list is-panel"
            aria-label="Search results"
            aria-busy={loading}
          >
            {hits.map((hit, i) => (
              <li
                key={`${hit.type}:${hit.key}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'rx-search-hit is-active' : 'rx-search-hit'}
                onPointerEnter={() => setActive(i)}
                onPointerDown={(e) => {
                  e.preventDefault(); // keep focus in the input
                  go(hit.href);
                }}
              >
                {tab === 'all' && (i === 0 || hits[i - 1]!.type !== hit.type) && (
                  <span className="rx-search-group">
                    {GROUP[hit.type]}
                    {counts && <span className="mr-num"> · {counts[hit.type]}</span>}
                  </span>
                )}
                <HitRow hit={hit} />
              </li>
            ))}
          </ul>
          {hits.length > 0 && (
            <p className="rx-search-foot">
              <kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to open ·{' '}
              <a
                href={all}
                onPointerDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  go(all);
                }}
              >
                All {total !== null ? total.toLocaleString('en-US') : ''} results
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
