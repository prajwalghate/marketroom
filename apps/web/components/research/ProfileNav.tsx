'use client';

import clsx from 'clsx';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * In-page navigation for a long profile, grouped the way a reader scans it —
 * overview, market, essentials, financials, on-chain. On wide screens it is a
 * sticky rail beside the content with the profile's identity on top; on
 * narrower ones the same links become a row of tabs. The link for the section
 * being read is marked as the current location.
 */

export interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly count?: number | null;
}

export interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join('|');
  useEffect(() => {
    let frame = 0;
    // The current section is the last one whose top has passed a line a third
    // of the way down the window; at the very bottom, the last section.
    const update = () => {
      frame = 0;
      const line = Math.min(window.innerHeight * 0.35, 280);
      let current: string | null = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      const atEnd =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      setActive(atEnd && ids.length ? ids[ids.length - 1]! : (current ?? ids[0] ?? null));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
    // `key` stands in for the ids array, which is rebuilt on every render.
  }, [key]);
  return active;
}

const count = (n: number | null | undefined) =>
  n !== undefined && n !== null ? <span className="rx-pnav-count mr-num">{n}</span> : null;

export function ProfileRail({ groups, head }: { groups: readonly NavGroup[]; head?: ReactNode }) {
  const shown = groups
    .map((g) => ({ ...g, items: g.items.filter(Boolean) }))
    .filter((g) => g.items.length);
  const active = useActiveSection(shown.flatMap((g) => g.items.map((i) => i.id)));
  return (
    <nav className="rx-pnav" aria-label="On this page">
      {head && <div className="rx-pnav-head">{head}</div>}
      {shown.map((g) => (
        <div key={g.label} className="rx-pnav-group">
          <p className="rx-pnav-label">{g.label}</p>
          <ul>
            {g.items.map((i) => (
              <li key={i.id}>
                <a
                  href={`#${i.id}`}
                  aria-current={active === i.id ? 'location' : undefined}
                  className={clsx(active === i.id && 'is-active')}
                >
                  <span>{i.label}</span>
                  {count(i.count)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function ProfileTabs({ groups }: { groups: readonly NavGroup[] }) {
  const items = groups.flatMap((g) => g.items);
  const active = useActiveSection(items.map((i) => i.id));
  return (
    <nav className="rx-stabs" aria-label="On this page">
      {items.map((i) => (
        <a
          key={i.id}
          href={`#${i.id}`}
          aria-current={active === i.id ? 'location' : undefined}
          className={clsx(active === i.id && 'is-active')}
        >
          {i.label}
          {i.count !== undefined && i.count !== null && (
            <span className="rx-stabs-count">{i.count}</span>
          )}
        </a>
      ))}
    </nav>
  );
}
