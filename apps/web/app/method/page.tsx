import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageHead } from '@/components/sol/primitives';

export const metadata: Metadata = {
  title: 'How the research database works',
  description:
    'Where every record comes from, how facts are tied to sources and checked, why on-chain activity is never funding, and what an estimate means here.',
};

/**
 * The research database's method, in plain words. A research product that
 * does not say where its facts come from is asking to be trusted; this page
 * says, so readers can check instead.
 */

const SOURCES: { name: string; gives: string; every: string; link: string }[] = [
  {
    name: 'DefiLlama',
    gives:
      'Projects, categories, descriptions, links, token mints, value locked, fees and revenue; funding rounds and investors; milestones and security incidents.',
    every: 'Projects every 6 hours; funding a batch an hour, stalest first; incidents daily',
    link: 'https://defillama.com',
  },
  {
    name: 'Jupiter',
    gives:
      'Token price, market cap, FDV, 24-hour volume, liquidity and holders; labels for swap programs.',
    every: 'Every 15 minutes; labels daily',
    link: 'https://jup.ag',
  },
  {
    name: 'GeckoTerminal',
    gives:
      'Daily price candles for a token’s deepest Solana pool, for the price charts on project and token pages. One pool’s trades, labelled as such — not an average across venues.',
    every: 'Fetched when a page needs it, cached for an hour',
    link: 'https://www.geckoterminal.com/solana/pools',
  },
  {
    name: 'OtterSec verified builds',
    gives:
      'Which deployed programs were reproduced from public source code, and the repository they came from.',
    every: 'Daily',
    link: 'https://verify.osec.io',
  },
  {
    name: 'Solana network (public RPC)',
    gives:
      'Each program’s loader, upgrade authority and last deploy; recent transaction signatures for activity estimates.',
    every: 'Hourly, mapped programs first',
    link: 'https://solana.com/docs/rpc',
  },
  {
    name: 'GitHub',
    gives:
      'Public organisation profiles and the people with the most commits to a project’s public repositories.',
    every: 'Hourly, within GitHub’s request budget',
    link: 'https://github.com',
  },
  {
    name: 'News feeds',
    gives:
      'Headlines and short summaries from Solana, Helius, Colosseum, Cointelegraph, The Block, Decrypt and CoinDesk — never full articles.',
    every: 'Every 30 minutes',
    link: '/updates',
  },
  {
    name: 'Solana Foundation events',
    gives: 'Conferences, hackathons and meetups from solana.com/events.',
    every: 'Daily',
    link: 'https://solana.com/events',
  },
];

export default function MethodPage() {
  return (
    <div className="mr-container rx-method">
      <PageHead
        title="How the research database works"
        lead="Every project, person, investor, round, token and program is its own record. Every connection between two records is a record too, with the source that states it and the date it was checked. Here is where it all comes from and what each label means."
      />

      <Block title="Records and connections">
        <p>
          Projects, people, investor organisations, funding rounds, tokens, Solana programs, news,
          events and sources are stored separately and joined by typed connections:{' '}
          <em>this person works at this project</em>, <em>this investor joined this round</em>,{' '}
          <em>this project operates this program</em>. A connection carries its own facts — a role,
          start and end dates, whether an investor led — and its own sources. That is what lets
          every name on a profile link to its own profile, and lets the same investor appear
          correctly on every project it backed.
        </p>
      </Block>

      <Block title="Where the data comes from">
        <div className="rx-table-wrap">
          <table className="rx-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>What it provides</th>
                <th>Refreshed</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((s) => (
                <tr key={s.name}>
                  <td>
                    {s.link.startsWith('/') ? (
                      <Link className="rx-strong-link" href={s.link}>
                        {s.name}
                      </Link>
                    ) : (
                      <a
                        className="rx-strong-link"
                        href={s.link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {s.name}
                      </a>
                    )}
                  </td>
                  <td>{s.gives}</td>
                  <td>{s.every}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Imports run continuously, each on its own schedule, and every run is logged. An import
          never overwrites a field an editor has set, and never brings back a record or connection
          an editor rejected.
        </p>
      </Block>

      <Block title="Sources and checked dates">
        <p>
          Every fact a reader can act on shows its sources one click away: who published it, what
          kind of source it is (announcement, press, filing, post, funding database, code, registry,
          on-chain), how it was obtained and when it was last checked. “How” is one of four things:
        </p>
        <ul>
          <li>
            <strong>Imported</strong> — read from the source by an import; the date is the last time
            an import saw it there.
          </li>
          <li>
            <strong>Read on-chain</strong> — taken from the Solana network itself.
          </li>
          <li>
            <strong>Inferred</strong> — worked out rather than stated: a program matched to a
            project by its repository or name, an investor read as a person from how the name is
            written. Inferences are always labelled and sent to an editor.
          </li>
          <li>
            <strong>Checked by an editor</strong> — a person read the source and confirmed it
            supports the fact, on the date shown.
          </li>
        </ul>
        <p>
          A profile’s own status says the same at a glance:{' '}
          <strong>Imported · not yet checked</strong>, <strong>Unconfirmed</strong> for automatic
          matches and guesses, and <strong>Checked</strong> with the date an editor last went
          through it.
        </p>
      </Block>

      <Block title="Funding is announced, not observed">
        <p>
          A funding round is recorded only from an announcement, press coverage, a filing, a post by
          the company or an investor, or a funding database that lists it. On-chain activity is
          never used to create, size or date a round: a wallet sending SOL or tokens does not show
          that a company raised venture money. The database enforces this — an on-chain source
          cannot be attached as evidence for a round.
        </p>
        <p>
          Undisclosed amounts are shown as undisclosed, never as zero. A round’s page lists, for
          each fact — amount, date, type, valuation — which source states it.
        </p>
      </Block>

      <Block title="Estimates">
        <p>
          On-chain activity is an <strong>estimate</strong>, and is marked{' '}
          <span className="rx-est-tag">est.</span> wherever it appears. A public RPC node returns a
          program’s most recent transaction signatures; the rate is how many of them fall between
          the oldest one returned and the moment of measurement. When the node returns fewer than
          asked, the sample holds all of its history, and the window starts there. It measures how
          busy a program is — not its users, its revenue, or its funding.
        </p>
        <p>
          Market figures — price, market cap, volume, holders — are the provider’s, labelled with
          the provider and both the time it reported them and the time we fetched them.
        </p>
      </Block>

      <Block title="Keeping it correct">
        <p>
          Editors confirm, correct and connect records in the editors’ dashboard: they work through
          a review queue of imported and automatically matched records, attach sources, mark facts
          as checked, merge duplicates — the duplicate keeps redirecting, and its name keeps
          resolving, so imports cannot recreate it — and review sources, marking broken or
          unreliable ones. Every change is logged with who made it and what it changed, and changes
          appear in{' '}
          <Link className="rx-clear" href="/updates">
            Updates
          </Link>
          .
        </p>
        <p>
          Checks age: a profile checked more than 90 days ago, or whose connections an import has
          changed since, goes back on the editors’ list.
        </p>
      </Block>

      <Block title="Open data">
        <p>
          Everything here is available as JSON from the{' '}
          <Link className="rx-clear" href="/api-docs">
            API
          </Link>
          , with the same sources and checked dates. Not investment advice: verify every figure at
          its source before acting on it.
        </p>
      </Block>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rx-sec rx-method-block" aria-label={title}>
      <h2 className="rx-sec-title">{title}</h2>
      <div className="rx-prose-block">{children}</div>
    </section>
  );
}
