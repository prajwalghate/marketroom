'use client';

import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { Avatar } from './Avatar';
import { useSearch } from './GlobalSearch';

const PROJECTS = ['project'] as const;

/**
 * Add a project to the comparison. The header search, limited to projects;
 * choosing one appends it to the URL.
 */
export function CompareAdd({ current }: { current: readonly string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const { hits: found, loading } = useSearch(query, PROJECTS);
  const hits = useMemo(() => found.filter((h) => !current.includes(h.key)), [found, current]);

  const add = (slug: string) => {
    setQuery('');
    router.push(`/compare?p=${[...current, slug].join(',')}`);
  };

  const open = query.trim().length > 0;
  return (
    <div className="rx-search rx-search-inline">
      <input
        type="search"
        className="rx-search-input"
        placeholder="Add a project…"
        aria-label="Add a project to compare"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && hits[active] ? `${listId}-${active}` : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(hits.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && hits[active]) {
            e.preventDefault();
            add(hits[active].key);
          } else if (e.key === 'Escape') {
            setQuery('');
          }
        }}
      />
      {open && (
        <ul id={listId} role="listbox" className="rx-search-list is-left" aria-label="Projects">
          {loading && hits.length === 0 && <li className="rx-search-note">Searching…</li>}
          {!loading && hits.length === 0 && <li className="rx-search-note">No project matches.</li>}
          {hits.map((hit, i) => (
            <li
              key={hit.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'rx-search-hit is-active' : 'rx-search-hit'}
              onPointerEnter={() => setActive(i)}
              onPointerDown={(e) => {
                e.preventDefault();
                add(hit.key);
              }}
            >
              <span className="rx-search-row">
                <Avatar src={hit.imageUrl} name={hit.name} size={22} shape="square" />
                <span className="rx-search-name">{hit.name}</span>
                {hit.detail && <span className="rx-search-detail">{hit.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
