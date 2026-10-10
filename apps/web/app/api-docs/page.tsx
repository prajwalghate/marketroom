import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageHead } from '@/components/sol/primitives';

export const metadata: Metadata = {
  title: 'API',
  description:
    'Free, read-only JSON for the Solana research database: projects, people, investors, rounds, tokens, programs, search and updates — every fact with its sources.',
};

/**
 * Public API reference.
 *
 * Every endpoint reads the same database the pages render from, and returns
 * the same evidence: each fact with its sources, how it was obtained and when
 * it was checked. No key, no sign-up; cache headers say how fresh each
 * response is allowed to be.
 */

interface Endpoint {
  path: string;
  summary: string;
  params?: [string, string][];
  example?: string;
  cache: string;
}

const GROUPS: { title: string; endpoints: Endpoint[] }[] = [
  {
    title: 'Projects',
    endpoints: [
      {
        path: '/api/v1/projects',
        summary:
          'The project directory: what each project does, category, status, latest funding, estimated on-chain activity, value locked, token, and when its profile was checked.',
        params: [
          ['q', 'Name, alias or token symbol.'],
          [
            'category, status, round, investor, activity, funded, review',
            'The directory’s filters, by value.',
          ],
          ['sort', 'tvl · raised · latest · activity · checked · name'],
          ['page, limit', 'Up to 500 per page.'],
        ],
        example: '/api/v1/projects?round=Seed&sort=latest&limit=5',
        cache: '60 s',
      },
      {
        path: '/api/v1/projects/{slug}',
        summary:
          'One project with every connected record: team, rounds and their investors, programs with activity estimates, tokens with their latest market snapshot, news, events, and every source with what it supports.',
        example: '/api/v1/projects/kamino',
        cache: '60 s',
      },
    ],
  },
  {
    title: 'People, investors and rounds',
    endpoints: [
      {
        path: '/api/v1/people',
        summary: 'People and what they are connected to.',
        params: [['q, page, limit', '']],
        example: '/api/v1/people?limit=5',
        cache: '60 s',
      },
      {
        path: '/api/v1/people/{slug}',
        summary: 'A person’s projects, organisations and personal investments, with sources.',
        cache: '60 s',
      },
      {
        path: '/api/v1/investors',
        summary: 'Investors — organisations and angels — by number of Solana deals.',
        params: [['q, page, limit', '']],
        example: '/api/v1/investors?limit=5',
        cache: '60 s',
      },
      {
        path: '/api/v1/investors/{slug}',
        summary: 'An investor’s team, portfolio, rounds, co-investors and focus, with sources.',
        example: '/api/v1/investors/multicoin-capital',
        cache: '60 s',
      },
      {
        path: '/api/v1/rounds',
        summary:
          'Funding rounds, newest first, each with its investors and strongest source. Never derived from on-chain transfers.',
        params: [
          ['since', 'Only rounds announced on or after YYYY-MM-DD.'],
          ['round', 'A round type, e.g. Seed.'],
          ['page, limit', ''],
        ],
        example: '/api/v1/rounds?since=2026-01-01&limit=5',
        cache: '60 s',
      },
      {
        path: '/api/v1/rounds/{slug}',
        summary:
          'A round’s amount, date, type, valuation and investors, and which source states each fact.',
        cache: '60 s',
      },
    ],
  },
  {
    title: 'Tokens and programs',
    endpoints: [
      {
        path: '/api/v1/tokens/{mint}',
        summary:
          'A token, its project, its latest market snapshot (provider and time) and snapshot history.',
        cache: '120 s',
      },
      {
        path: '/api/v1/programs',
        summary: 'Solana programs, the projects mapped to them, and estimated activity.',
        params: [['page, limit', '']],
        example: '/api/v1/programs?limit=5',
        cache: '60 s',
      },
      {
        path: '/api/v1/programs/{address}',
        summary:
          'A program’s projects, on-chain facts (loader, upgrade authority, verified build) and activity estimates with their method.',
        cache: '120 s',
      },
    ],
  },
  {
    title: 'Search and updates',
    endpoints: [
      {
        path: '/api/v1/search',
        summary:
          'Ranked results across projects, people, investors, tokens and programs. Mints and program addresses match by prefix.',
        params: [
          ['q', 'Required.'],
          ['types', 'Comma-separated: project, person, investor, token, program.'],
          ['limit', 'Per type, up to 50.'],
        ],
        example: '/api/v1/search?q=jup',
        cache: '30 s',
      },
      {
        path: '/api/v1/updates',
        summary:
          'What changed: rounds added, people linked, programs mapped, profiles checked by an editor, and news that mentions a record.',
        params: [
          [
            'watch',
            'Comma-separated project:slug, person:slug, investor:slug — only updates to those.',
          ],
          ['since', 'Epoch milliseconds.'],
          ['limit', 'Up to 200.'],
        ],
        example: '/api/v1/updates?limit=10',
        cache: '60 s',
      },
      {
        path: '/updates/feed.xml',
        summary: 'The same updates as RSS, for any feed reader. Takes the same watch parameter.',
        example: '/updates/feed.xml',
        cache: '5 min',
      },
    ],
  },
  {
    title: 'Tokenized assets',
    endpoints: [
      {
        path: '/api/trust',
        summary:
          'Every tokenized-asset listing’s trust verdict — whether its displayed price is one you could trade at.',
        example: '/api/trust',
        cache: '60 s',
      },
      {
        path: '/api/trust/{asset}',
        summary: 'One tokenized asset’s trust check with every measured fill.',
        cache: '60 s',
      },
      { path: '/api/snapshot', summary: 'Live prices and listings across venues.', cache: '15 s' },
    ],
  },
];

export default function ApiDocsPage() {
  return (
    <div className="mr-container">
      <PageHead
        title="API"
        lead="Free, read-only JSON for everything on Marketroom. No key and no sign-up; readable from any origin. Records come with the same evidence the pages show — each fact’s sources, how it was obtained, and when it was checked."
      />
      <div className="rx-layout-main">
        {GROUPS.map((g) => (
          <section key={g.title} className="rx-sec" aria-label={g.title}>
            <h2 className="rx-sec-title">{g.title}</h2>
            <div className="rx-api-list">
              {g.endpoints.map((e) => (
                <article key={e.path} className="rx-api">
                  <p className="rx-api-path mr-num">
                    <span className="rx-api-verb">GET</span> {e.path}
                  </p>
                  <p className="rx-api-summary">{e.summary}</p>
                  {e.params && e.params.some(([, about]) => about) && (
                    <dl className="rx-api-params">
                      {e.params.map(([name, about]) => (
                        <Line key={name} name={name}>
                          {about}
                        </Line>
                      ))}
                    </dl>
                  )}
                  <p className="rx-api-meta">
                    {e.example && (
                      <>
                        Try{' '}
                        <a href={e.example} className="rx-clear mr-num">
                          {e.example}
                        </a>{' '}
                        ·{' '}
                      </>
                    )}
                    Cached {e.cache} at the edge
                  </p>
                </article>
              ))}
            </div>
          </section>
        ))}
        <p className="rx-footnote">
          Missing values are <code>null</code>, never zero. Amounts are USD; dates are ISO 8601;
          times are epoch milliseconds. Activity figures are estimates and say so. How every figure
          is obtained is on the{' '}
          <Link href="/method" className="rx-clear">
            method page
          </Link>
          . Please cache on your side.
        </p>
      </div>
    </div>
  );
}

function Line({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="rx-api-param">
      <dt>
        <code className="mr-num">{name}</code>
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
