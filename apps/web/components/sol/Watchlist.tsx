'use client';

import { formatCompactUsd, formatPrice } from '@marketroom/core';
import Link from 'next/link';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Avatar } from './Avatar';

/**
 * A personal watchlist, kept in this browser — projects, people, investors
 * and tokens alike.
 *
 * No account: the list lives in localStorage, so it is private to this
 * browser and survives reloads but not a cleared profile — which the page
 * says. Every read and write is guarded, because storage can be unavailable
 * (private windows, blocked site data) and the site must work without it.
 *
 * Entries are `kind:slug`. Entries from before kinds existed are bare project
 * slugs and still count as projects.
 */

export type WatchKind = 'project' | 'person' | 'investor' | 'token';
export interface WatchEntry {
  readonly kind: WatchKind;
  readonly slug: string;
}

const KEY = 'mr-watchlist';
const SEEN = 'mr-updates-seen';
const EVENT = 'mr-watchlist-change';
const KINDS: WatchKind[] = ['project', 'person', 'investor', 'token'];

export function parseEntry(raw: string): WatchEntry | null {
  const i = raw.indexOf(':');
  if (i === -1) return raw ? { kind: 'project', slug: raw } : null;
  const kind = raw.slice(0, i) as WatchKind;
  const slug = raw.slice(i + 1);
  return KINDS.includes(kind) && slug ? { kind, slug } : null;
}
export const entryKey = (e: WatchEntry) => `${e.kind}:${e.slug}`;

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list)
      ? list
          .filter((s): s is string => typeof s === 'string')
          .map((s) => parseEntry(s))
          .filter((e): e is WatchEntry => e !== null)
          .map(entryKey)
      : [];
  } catch {
    return [];
  }
}

function write(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: the button still toggles for this page view */
  }
  window.dispatchEvent(new Event(EVENT));
}

let cache: { raw: string | null; list: string[] } = { raw: null, list: [] };
function snapshot(): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== cache.raw) cache = { raw, list: read() };
  return cache.list;
}
const EMPTY: string[] = [];
function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useWatchlist() {
  const list = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const toggle = useCallback((entry: WatchEntry) => {
    const key = entryKey(entry);
    const current = read();
    write(current.includes(key) ? current.filter((s) => s !== key) : [...current, key]);
  }, []);
  return { list, toggle };
}

/** Star a record. A real toggle button: `aria-pressed` says which state it is in. */
export function WatchButton({ kind, slug, name }: { kind: WatchKind; slug: string; name: string }) {
  const { list, toggle } = useWatchlist();
  const on = list.includes(entryKey({ kind, slug }));
  return (
    <button
      type="button"
      className={on ? 'rx-link rx-watch is-on' : 'rx-link rx-watch'}
      aria-pressed={on}
      onClick={() => toggle({ kind, slug })}
    >
      <span aria-hidden="true">{on ? '★' : '☆'}</span> {on ? 'Watching' : 'Watch'}
      <span className="sr-only"> {name}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

function readSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN)) || 0;
  } catch {
    return 0;
  }
}

/** Remember that the reader has seen their updates up to now. */
export function markUpdatesSeen() {
  try {
    localStorage.setItem(SEEN, String(Date.now()));
  } catch {
    /* nothing to remember without storage */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** The watched records as the API's `watch` parameter. Tokens have no update feed of their own. */
export const watchParam = (list: readonly string[]) =>
  list
    .map(parseEntry)
    .filter((e): e is WatchEntry => !!e && e.kind !== 'token')
    .map((e) => `${e.kind === 'investor' ? 'organization' : e.kind}:${e.slug}`)
    .join(',');

/**
 * The bell in the header: how many updates to watched records arrived since
 * the reader last looked. Checks on load and every five minutes while open.
 */
export function AlertsBell() {
  const { list } = useWatchlist();
  const [count, setCount] = useState(0);
  const watch = watchParam(list);

  useEffect(() => {
    if (!watch) {
      setCount(0);
      return;
    }
    let cancelled = false;
    const check = () => {
      const since = readSeen() || Date.now() - 7 * 86_400_000;
      // eslint-disable-next-line no-restricted-globals -- same-origin, our own route
      fetch(`/api/v1/updates?watch=${encodeURIComponent(watch)}&since=${since}&limit=50`)
        .then((r) => (r.ok ? r.json() : { updates: [] }))
        .then((d: { updates?: unknown[] }) => {
          if (!cancelled) setCount(d.updates?.length ?? 0);
        })
        .catch(() => {});
    };
    check();
    const timer = setInterval(check, 5 * 60_000);
    const onSeen = () => check();
    window.addEventListener(EVENT, onSeen);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener(EVENT, onSeen);
    };
  }, [watch]);

  const label = count
    ? `${count} new ${count === 1 ? 'update' : 'updates'} to what you watch`
    : 'Updates to what you watch';
  return (
    <Link href="/updates?mine=1" className="mr-btn-icon rx-bell" aria-label={label} title={label}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {count > 0 && (
        <span className="rx-bell-count" aria-hidden="true">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// The watchlist page
// ---------------------------------------------------------------------------

interface WatchItem {
  kind: WatchKind;
  slug: string;
  name: string;
  imageUrl: string | null;
  href: string;
  detail: string | null;
  price: number | null;
  change24h: number | null;
  tvl: number | null;
  raised: number | null;
  latest: string | null;
}

interface Update {
  id: string;
  at: number;
  kind: 'change' | 'news';
  title: string;
  url: string;
  external: boolean;
  subject: { type: string; slug: string; name: string } | null;
  publisher: string | null;
}

const KIND_LABEL: Record<WatchKind, string> = {
  project: 'Projects',
  person: 'People',
  investor: 'Investors',
  token: 'Tokens',
};

export function WatchlistView() {
  const { list, toggle } = useWatchlist();
  const [data, setData] = useState<{ items: WatchItem[]; updates: Update[] } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (list.length === 0) {
      setData({ items: [], updates: [] });
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line no-restricted-globals -- same-origin, our own route
    fetch(`/api/v1/watchlist?items=${encodeURIComponent(list.join(','))}`)
      .then((r) => (r.ok ? r.json() : { items: [], updates: [] }))
      .then((d: { items: WatchItem[]; updates: Update[] }) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData({ items: [], updates: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [list]);

  if (!mounted || data === null) return <p className="rx-empty">Loading your watchlist…</p>;
  if (list.length === 0) {
    return (
      <p className="rx-empty">
        Nothing watched yet. Open a{' '}
        <Link href="/projects" className="rx-clear">
          project
        </Link>
        ,{' '}
        <Link href="/investors" className="rx-clear">
          investor
        </Link>{' '}
        or{' '}
        <Link href="/people" className="rx-clear">
          person
        </Link>{' '}
        and press Watch to follow it here.
      </p>
    );
  }

  return (
    <div className="rx-grid is-2 rx-watch-grid">
      <div>
        {KINDS.map((kind) => {
          const items = data.items.filter((i) => i.kind === kind);
          if (items.length === 0) return null;
          return (
            <section key={kind} className="rx-sec" aria-labelledby={`watch-${kind}`}>
              <header className="rx-sec-head">
                <h2 className="rx-sec-title" id={`watch-${kind}`}>
                  {KIND_LABEL[kind]}
                  <span className="rx-sec-count">{items.length}</span>
                </h2>
              </header>
              <ul className="rx-watchlist">
                {items.map((i) => (
                  <li key={`${i.kind}:${i.slug}`}>
                    <Link href={i.href} className="rx-entity" prefetch={false}>
                      <Avatar
                        src={i.imageUrl}
                        name={i.name}
                        size={28}
                        shape={i.kind === 'person' ? 'round' : 'square'}
                      />
                      <span className="rx-entity-text">
                        <span className="rx-entity-name">{i.name}</span>
                        {i.detail && <span className="rx-entity-sub">{i.detail}</span>}
                      </span>
                    </Link>
                    <span className="rx-watch-figures mr-num">
                      {i.price !== null && <span>{formatPrice(i.price)}</span>}
                      {i.tvl !== null && <span>TVL {formatCompactUsd(i.tvl)}</span>}
                      {i.raised !== null && <span>Raised {formatCompactUsd(i.raised)}</span>}
                      {i.latest && <span className="rx-muted">{i.latest}</span>}
                    </span>
                    <button
                      type="button"
                      className="rx-chip-remove"
                      onClick={() => toggle({ kind: i.kind, slug: i.slug })}
                      aria-label={`Stop watching ${i.name}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <section className="rx-sec" aria-labelledby="watch-updates">
        <header className="rx-sec-head">
          <h2 className="rx-sec-title" id="watch-updates">
            Updates to what you watch
          </h2>
          <Link href="/updates?mine=1" className="rx-more" prefetch={false}>
            All updates →
          </Link>
        </header>
        {data.updates.length === 0 ? (
          <p className="rx-empty">No updates in the last 90 days.</p>
        ) : (
          <ul className="rx-feed">
            {data.updates.slice(0, 25).map((u) => (
              <li key={u.id}>
                <time dateTime={new Date(u.at).toISOString()}>
                  {new Intl.DateTimeFormat('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'UTC',
                  }).format(u.at)}
                </time>
                <div>
                  {u.external ? (
                    <a
                      href={u.url}
                      className="rx-feed-title"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {u.title}
                    </a>
                  ) : (
                    <Link href={u.url} className="rx-feed-title" prefetch={false}>
                      {u.title}
                    </Link>
                  )}
                  <span className="rx-feed-meta">
                    {u.subject?.name}
                    {u.publisher
                      ? ` · ${u.publisher}`
                      : u.kind === 'change'
                        ? ' · database update'
                        : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
