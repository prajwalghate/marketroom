import { search, searchCounts, type SearchHit, type SearchType } from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchBox } from '@/components/research/Filters';
import { HitRow } from '@/components/sol/GlobalSearch';
import { PageHead } from '@/components/sol/primitives';
import { hrefWith, one, type Params } from '@/lib/query';
import { researchDb } from '@/lib/research';

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search Solana projects, people, investors, tokens and programs.',
};

export const dynamic = 'force-dynamic';

const TABS: { type: SearchType | ''; label: string }[] = [
  { type: '', label: 'All' },
  { type: 'project', label: 'Projects' },
  { type: 'investor', label: 'Investors' },
  { type: 'person', label: 'People' },
  { type: 'token', label: 'Tokens' },
  { type: 'program', label: 'Programs' },
];

const GROUP: Record<SearchType, string> = {
  project: 'Projects',
  investor: 'Investors',
  person: 'People',
  token: 'Tokens',
  program: 'Programs',
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const q = one(params.q).trim();
  const type = one(params.type) as SearchType | '';
  const db = q ? await researchDb() : null;
  const [hits, counts]: [SearchHit[], Record<SearchType, number> | null] = db
    ? await Promise.all([
        search(db, q, { perType: type ? 50 : 8, types: type ? [type] : undefined }),
        searchCounts(db, q),
      ])
    : [[], null];
  const total = counts ? Object.values(counts).reduce((s, n) => s + n, 0) : 0;
  const groups = (Object.keys(GROUP) as SearchType[])
    .map((t) => ({ type: t, hits: hits.filter((h) => h.type === t) }))
    .filter((g) => g.hits.length);

  return (
    <div className="mr-container">
      <PageHead
        title="Search"
        lead="Projects, people, investors, tokens and programs — by name, alias, ticker, or a pasted mint or program address."
      />
      <SearchBox
        base="/search"
        params={params}
        placeholder="Try Kamino, Multicoin, JUP or a program address"
        label="Search the database"
      />
      {q && (
        <nav className="rx-seg is-tabs" aria-label="Result types">
          {TABS.map((t) => (
            <Link
              key={t.label}
              href={hrefWith('/search', params, { type: t.type || null })}
              aria-current={type === t.type ? 'true' : undefined}
              prefetch={false}
            >
              {t.label}
              {counts && (
                <span className="rx-search-tabn mr-num">{t.type ? counts[t.type] : total}</span>
              )}
            </Link>
          ))}
        </nav>
      )}
      {!q ? (
        <p className="rx-empty">Type a name, a ticker or an address.</p>
      ) : groups.length === 0 ? (
        <p className="rx-empty" role="status">
          Nothing matches “{q}”.
        </p>
      ) : (
        <div className="rx-search-results" role="status" aria-live="polite">
          {groups.map((g) => (
            <section key={g.type} className="rx-sec" aria-labelledby={`hits-${g.type}`}>
              <header className="rx-sec-head">
                <h2 className="rx-sec-title" id={`hits-${g.type}`}>
                  {GROUP[g.type]}
                  <span className="rx-sec-count">{counts?.[g.type] ?? g.hits.length}</span>
                </h2>
                {!type && (counts?.[g.type] ?? 0) > g.hits.length && (
                  <Link
                    href={hrefWith('/search', params, { type: g.type })}
                    className="rx-more"
                    prefetch={false}
                  >
                    All {counts?.[g.type]} {GROUP[g.type].toLowerCase()} →
                  </Link>
                )}
              </header>
              <ul className="rx-hitlist is-rich">
                {g.hits.map((h) => (
                  <li key={`${h.type}:${h.key}`}>
                    <Link href={h.href} className="rx-hitlink" prefetch={false}>
                      <HitRow hit={h} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
