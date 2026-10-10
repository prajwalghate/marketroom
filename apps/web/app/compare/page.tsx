import type { Project } from '@marketroom/core';
import { formatCompactUsd, formatCount, formatPrice, marketFor, slugify } from '@marketroom/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CompareAdd } from '@/components/sol/CompareAdd';
import { Avatar } from '@/components/sol/Avatar';
import { AreaChart, Delta, Empty, PageHead, Panel, Tag } from '@/components/sol/primitives';
import {
  getFundingRoundsIfReady,
  getMarketIndex,
  getProjectDetail,
  getProjectFlows,
  getSolanaProjects,
  resolveProjectSlug,
} from '@/lib/solana';
import { one, type Params } from '@/lib/query';

export const metadata: Metadata = {
  title: 'Compare projects',
  description:
    'Compare Solana projects side by side — value locked, token market, fees, revenue and funding.',
};

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX = 4;
const dateFmt = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

export default async function ComparePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const typed = [
    ...new Set(
      one(params.p)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].slice(0, MAX);
  const resolved = await Promise.all(
    typed.map(async (t) => ({ typed: t, slug: await resolveProjectSlug(t) })),
  );
  const requested = [...new Set(resolved.map((r) => r.slug).filter((s): s is string => !!s))];
  const unknown = resolved.filter((r) => !r.slug).map((r) => r.typed);

  const [projects, markets, rounds] = await Promise.all([
    getSolanaProjects(),
    getMarketIndex(),
    getFundingRoundsIfReady(3_000),
  ]);
  const bySlug = new Map(projects.map((p) => [p.slug, p]));
  const chosen = requested.map((s) => bySlug.get(s)).filter((p): p is Project => !!p);

  const columns = await Promise.all(
    chosen.map(async (project) => {
      const [detail, flows] = await Promise.all([
        getProjectDetail(project.slug),
        getProjectFlows(project),
      ]);
      const own = (rounds ?? []).filter((r) => r.projectSlug === project.slug);
      const disclosed = own.filter((r) => r.amount !== null);
      const investors = new Set(
        own.flatMap((r) => [...r.leadInvestors, ...r.otherInvestors].map(slugify)),
      );
      return {
        project,
        market: marketFor(project, markets),
        detail,
        flows,
        rounds: own,
        raised: disclosed.length ? disclosed.reduce((s, r) => s + r.amount!, 0) : null,
        investors: investors.size,
      };
    }),
  );

  const without = (slug: string) => {
    const rest = chosen.map((p) => p.slug).filter((s) => s !== slug);
    return rest.length ? `/compare?p=${rest.join(',')}` : '/compare';
  };
  const suggestions = [...projects]
    .filter((p) => !requested.includes(p.slug))
    .sort((a, b) => (b.tvlSolana ?? 0) - (a.tvlSolana ?? 0))
    .slice(0, 8);

  const rows: [string, (c: (typeof columns)[number]) => ReactNode][] = [
    [
      'Categories',
      (c) => (
        <span className="rx-tags" style={{ justifyContent: 'flex-end' }}>
          {c.project.tags.slice(0, 3).map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </span>
      ),
    ],
    ['TVL on Solana', (c) => formatCompactUsd(c.project.tvlSolana)],
    ['TVL change 7d', (c) => <Delta value={c.project.tvlChange7d} />],
    ['Token', (c) => c.project.symbol ?? '—'],
    ['Price', (c) => formatPrice(c.market?.price ?? null)],
    ['Price change 24h', (c) => <Delta value={c.market?.change24h} />],
    ['Market cap', (c) => formatCompactUsd(c.market?.marketCap ?? null)],
    ['FDV', (c) => formatCompactUsd(c.market?.fdv ?? null)],
    ['Volume 24h', (c) => formatCompactUsd(c.market?.volume24h ?? null)],
    ['Holders', (c) => formatCount(c.market?.holders ?? null)],
    ['Fees 30d', (c) => formatCompactUsd(c.flows.fees.d30)],
    ['Revenue 30d', (c) => formatCompactUsd(c.flows.revenue.d30)],
    [
      'Funding raised',
      (c) =>
        c.raised !== null ? formatCompactUsd(c.raised) : c.rounds.length ? 'Undisclosed' : '—',
    ],
    ['Rounds · investors', (c) => (c.rounds.length ? `${c.rounds.length} · ${c.investors}` : '—')],
    [
      'Latest round',
      (c) =>
        c.rounds[0] ? `${c.rounds[0].round ?? 'Round'} · ${dateFmt.format(c.rounds[0].date)}` : '—',
    ],
    ['Listed', (c) => (c.project.listedAt ? dateFmt.format(c.project.listedAt) : '—')],
    ['Products', (c) => String(Math.max(1, c.project.products.length))],
  ];

  return (
    <div className="mr-container">
      <PageHead
        title="Compare projects"
        lead={`Up to ${MAX} Solana projects side by side — value locked, token market, fees, revenue and funding, from the same live sources as their profiles.`}
      />

      <div className="rx-results-head" style={{ alignItems: 'center', marginBottom: 14 }}>
        <div className="rx-chips">
          {chosen.map((p) => (
            <span key={p.slug} className="rx-chip">
              <Avatar src={p.logo} name={p.name} size={18} />
              <Link href={`/projects/${p.slug}`} prefetch={false}>
                {p.name}
              </Link>
              <Link
                href={without(p.slug)}
                className="rx-chip-remove"
                aria-label={`Remove ${p.name}`}
                prefetch={false}
              >
                ×
              </Link>
            </span>
          ))}
        </div>
        {chosen.length < MAX && <CompareAdd current={chosen.map((p) => p.slug)} />}
      </div>

      {unknown.length > 0 && (
        <p className="rx-empty" role="status" style={{ marginBottom: 14 }}>
          No Solana project matches {unknown.map((u) => `“${u}”`).join(', ')}. Use the box above to
          find it.
        </p>
      )}

      {chosen.length === 0 ? (
        <Panel title="Start with one of these">
          <div className="rx-chips">
            {suggestions.map((p) => (
              <Link key={p.slug} href={`/compare?p=${p.slug}`} className="rx-chip" prefetch={false}>
                <Avatar src={p.logo} name={p.name} size={18} />
                <span>{p.name}</span>
              </Link>
            ))}
          </div>
        </Panel>
      ) : (
        <>
          <Panel title="Side by side">
            <div className="rx-table-wrap">
              <table className="rx-table rx-compare">
                <thead>
                  <tr>
                    <th>
                      <span className="sr-only">Measure</span>
                    </th>
                    {columns.map((c) => (
                      <th key={c.project.slug} className="is-num" scope="col">
                        <Link
                          href={`/projects/${c.project.slug}`}
                          className="rx-entity"
                          style={{ justifyContent: 'flex-end' }}
                          prefetch={false}
                        >
                          <Avatar src={c.project.logo} name={c.project.name} size={20} />
                          <span className="rx-entity-name">{c.project.name}</span>
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([label, cell]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      {columns.map((c) => (
                        <td key={c.project.slug} className="is-num">
                          {cell(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rounds === null && (
              <p className="rx-prose" style={{ marginTop: 8, fontSize: 'var(--mr-text-xs)' }}>
                Funding figures are still being assembled and will appear on refresh.
              </p>
            )}
          </Panel>

          <div className="rx-grid is-2" style={{ marginTop: 14 }}>
            {columns.map((c) => (
              <Panel key={c.project.slug} title={`${c.project.name} · value locked on Solana`}>
                {c.detail && c.detail.tvlSeries.length > 1 ? (
                  <AreaChart
                    series={c.detail.tvlSeries.slice(-365)}
                    label={`${c.project.name} TVL, last year`}
                    format={(v) => formatCompactUsd(v)}
                  />
                ) : (
                  <Empty>No value-locked history recorded.</Empty>
                )}
              </Panel>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
