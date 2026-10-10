'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { markUpdatesSeen, useWatchlist, watchParam } from '@/components/sol/Watchlist';

interface Update {
  id: string;
  at: number;
  kind: 'change' | 'news';
  action: string;
  title: string;
  url: string;
  external: boolean;
  subject: { type: string; slug: string; name: string } | null;
  publisher: string | null;
}

/** Opening the updates page counts as reading them: the bell resets. */
export function MarkSeen() {
  useEffect(() => {
    const t = setTimeout(markUpdatesSeen, 1500);
    return () => clearTimeout(t);
  }, []);
  return null;
}

/** Updates to the records in this browser's watchlist. */
export function MyUpdates() {
  const { list } = useWatchlist();
  const watch = watchParam(list);
  const [updates, setUpdates] = useState<Update[] | null>(null);

  useEffect(() => {
    if (!watch) {
      setUpdates([]);
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line no-restricted-globals -- same-origin, our own route
    fetch(`/api/v1/updates?watch=${encodeURIComponent(watch)}&limit=100`)
      .then((r) => (r.ok ? r.json() : { updates: [] }))
      .then((d: { updates: Update[] }) => !cancelled && setUpdates(d.updates))
      .catch(() => !cancelled && setUpdates([]));
    return () => {
      cancelled = true;
    };
  }, [watch]);

  if (updates === null) return <p className="rx-empty">Loading your updates…</p>;
  if (!watch)
    return (
      <p className="rx-empty">
        You are not watching anything yet. Press Watch on a project, investor or person and their
        updates will collect here.
      </p>
    );
  if (updates.length === 0)
    return <p className="rx-empty">No updates to what you watch in the last 90 days.</p>;
  const day = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <>
      <p className="rx-footnote">
        Follow these in a feed reader:{' '}
        <a className="rx-clear" href={`/updates/feed.xml?watch=${encodeURIComponent(watch)}`}>
          your RSS feed
        </a>
        .
      </p>
      <ul className="rx-feed is-wide">
        {updates.map((u) => (
          <li key={u.id}>
            <time dateTime={new Date(u.at).toISOString()}>{day.format(u.at)}</time>
            <div>
              {u.subject && <strong>{u.subject.name}</strong>}
              {u.subject && ' — '}
              {u.external ? (
                <a href={u.url} target="_blank" rel="noopener noreferrer" className="rx-feed-title">
                  {u.title}
                </a>
              ) : (
                <Link href={u.url} className="rx-feed-title" prefetch={false}>
                  {u.title}
                </Link>
              )}
              <span className="rx-feed-meta">
                {u.publisher ?? (u.kind === 'change' ? 'database update' : '')}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
