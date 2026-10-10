import type { FlowEntry, TokenMarket } from '@marketroom/core';
import { formatCompactUsd, formatCount, formatPrice, projectRows } from '@marketroom/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ProtocolLink } from '@/components/research/Entities';
import { Avatar } from '@/components/sol/Avatar';
import { Delta, Empty, PageHead, ProjectCell, Tag } from '@/components/sol/primitives';
import {
  getFlows,
  getFundingRoundsIfReady,
  getMarketIndex,
  getMarkets,
  getProjectSlugIndex,
  getSolanaProjects,
} from '@/lib/solana';
import { one, type Params } from '@/lib/query';

export const metadata: Metadata = {
  title: 'Discover',
  description:
    'Rankings across the Solana ecosystem: token movers, trading, value-locked growth, fees, revenue, new and funded projects.',
};

export const revalidate = 300;
export const maxDuration = 60;

const TABS = [
  { id: 'gainers', label: 'Top gainers', group: 'Tokens' },
  { id: 'losers', label: 'Top losers', group: 'Tokens' },
  { id: 'traded', label: 'Most traded', group: 'Tokens' },
  { id: 'organic', label: 'Most organic', group: 'Tokens' },
  { id: 'tvl', label: 'TVL growth', group: 'Projects' },
  { id: 'fees', label: 'Fees', group: 'Projects' },
  { id: 'revenue', label: 'Revenue', group: 'Projects' },
  { id: 'new', label: 'Newly listed', group: 'Projects' },
  { id: 'funded', label: 'Most funded', group: 'Projects' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const DESCRIPTIONS: Record<TabId, string> = {
  gainers:
    'Verified tokens with at least $100k of on-chain liquidity, by price change over 24 hours.',
  losers: 'Verified tokens with at least $100k of on-chain liquidity, by price fall over 24 hours.',
  traded: "Jupiter's ranking of tokens by 24-hour trading volume.",
  organic:
    "Jupiter's ranking by organic score — its measure of trading that is not wash or bot activity.",
  tvl: 'Projects holding over $1M on Solana, by change in value locked over seven days.',
  fees: 'Protocols by fees users paid in the last 24 hours, on Solana.',
  revenue: 'Protocols by revenue kept over the last 30 days, on Solana.',
  new: 'Projects most recently added to DefiLlama, newest first.',
  funded: 'Projects by total disclosed funding.',
};

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const tab: TabId = TABS.find((t) => t.id === one(params.tab))?.id ?? 'gainers';

  return (
    <div className="mr-container">
      <PageHead
        title="Discover"
        lead="What is moving on Solana right now — tokens, protocols and money — ranked from live data."
      />
      <nav className="rx-tabs" aria-label="Rankings">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === 'gainers' ? '/discover' : `/discover?tab=${t.id}`}
            aria-current={tab === t.id ? 'page' : undefined}
            prefetch={false}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <p className="rx-prose" style={{ margin: '0 0 12px', fontSize: 'var(--mr-text-xs)' }}>
        {DESCRIPTIONS[tab]}
      </p>
      <section className="rx-panel" aria-label={TABS.find((t) => t.id === tab)!.label}>
        <Ranking tab={tab} />
      </section>
    </div>
  );
}

async function Ranking({ tab }: { tab: TabId }) {
  if (tab === 'gainers' || tab === 'losers' || tab === 'traded' || tab === 'organic') {
    const markets = await getMarkets();
    const all = Object.values(markets.byKey).filter((m) => !m.key.startsWith('cg:'));
    const unique = [...new Map(all.map((m) => [m.key, m])).values()];
    let list: TokenMarket[];
    if (tab === 'traded' || tab === 'organic') {
      list = (tab === 'traded' ? markets.traded : markets.organic)
        .map((k) => markets.byKey[k])
        .filter((m): m is TokenMarket => !!m);
    } else {
      const eligible = unique.filter(
        (m) => m.verified && (m.liquidity ?? 0) >= 100_000 && m.change24h !== null,
      );
      list = eligible.sort((a, b) =>
        tab === 'gainers' ? b.change24h! - a.change24h! : a.change24h! - b.change24h!,
      );
    }
    return <TokenTable markets={list.slice(0, 50)} />;
  }

  if (tab === 'fees' || tab === 'revenue') {
    const [flows, slugs] = await Promise.all([
      getFlows(tab).catch(() => null),
      getProjectSlugIndex(),
    ]);
    const entries = [...(flows?.entries ?? [])]
      .sort((a, b) =>
        tab === 'fees'
          ? (b.total24h ?? 0) - (a.total24h ?? 0)
          : (b.total30d ?? 0) - (a.total30d ?? 0),
      )
      .slice(0, 50);
    return (
      <FlowTable
        entries={entries}
        slugs={slugs}
        primary={tab === 'fees' ? 'total24h' : 'total30d'}
      />
    );
  }

  const [projects, markets, rounds] = await Promise.all([
    getSolanaProjects(),
    getMarketIndex(),
    getFundingRoundsIfReady(4_000),
  ]);
  const rows = projectRows(projects, markets, rounds ?? []);

  if (tab === 'tvl') {
    const list = rows
      .filter((r) => (r.project.tvlSolana ?? 0) >= 1e6 && r.project.tvlChange7d !== null)
      .sort((a, b) => b.project.tvlChange7d! - a.project.tvlChange7d!)
      .slice(0, 50);
    return (
      <ProjectTable
        rows={list}
        columns={[
          ['TVL', (r) => formatCompactUsd(r.project.tvlSolana)],
          ['7d', (r) => <Delta value={r.project.tvlChange7d} />],
          ['1d', (r) => <Delta value={r.project.tvlChange1d} />],
        ]}
      />
    );
  }
  if (tab === 'new') {
    const list = rows
      .filter((r) => r.project.listedAt)
      .sort((a, b) => b.project.listedAt! - a.project.listedAt!)
      .slice(0, 50);
    const fmt = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    return (
      <ProjectTable
        rows={list}
        columns={[
          ['Listed', (r) => fmt.format(r.project.listedAt!)],
          ['TVL', (r) => formatCompactUsd(r.project.tvlSolana)],
        ]}
      />
    );
  }
  // funded
  if (rounds === null)
    return <Empty>Funding data is still being assembled — try again in a minute.</Empty>;
  const list = rows
    .filter((r) => r.raised !== null)
    .sort((a, b) => b.raised! - a.raised!)
    .slice(0, 50);
  return (
    <ProjectTable
      rows={list}
      columns={[
        ['Raised', (r) => formatCompactUsd(r.raised)],
        ['Rounds', (r) => String(r.rounds.length)],
        ['TVL', (r) => formatCompactUsd(r.project.tvlSolana)],
      ]}
    />
  );
}

function TokenTable({ markets }: { markets: TokenMarket[] }) {
  if (markets.length === 0) return <Empty>Token markets are unavailable right now.</Empty>;
  return (
    <div className="rx-table-wrap">
      <table className="rx-table">
        <thead>
          <tr>
            <th className="is-rank">#</th>
            <th>Token</th>
            <th className="is-num">Price</th>
            <th className="is-num">1h</th>
            <th className="is-num">24h</th>
            <th className="is-num rx-hide-sm">Volume 24h</th>
            <th className="is-num rx-hide-sm">Market cap</th>
            <th className="is-num rx-hide-sm">Liquidity</th>
            <th className="is-num rx-hide-sm">Holders</th>
          </tr>
        </thead>
        <tbody>
          {markets.map((m, i) => (
            <tr key={m.key}>
              <td className="is-rank mr-num">{i + 1}</td>
              <td>
                <Link href={`/tokens/${m.mint}`} className="rx-entity" prefetch={false}>
                  <Avatar src={m.image} name={m.symbol || m.name} size={24} />
                  <span className="rx-entity-name">{m.name}</span>
                  <span className="rx-entity-sym mr-num">{m.symbol}</span>
                </Link>
              </td>
              <td className="is-num">{formatPrice(m.price)}</td>
              <td className="is-num">
                <Delta value={m.change1h} />
              </td>
              <td className="is-num">
                <Delta value={m.change24h} />
              </td>
              <td className="is-num rx-hide-sm">{formatCompactUsd(m.volume24h)}</td>
              <td className="is-num rx-hide-sm">{formatCompactUsd(m.marketCap)}</td>
              <td className="is-num rx-hide-sm">{formatCompactUsd(m.liquidity)}</td>
              <td className="is-num rx-hide-sm">{formatCount(m.holders)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FlowTable({
  entries,
  slugs,
  primary,
}: {
  entries: FlowEntry[];
  slugs: Map<string, string>;
  primary: 'total24h' | 'total30d';
}) {
  if (entries.length === 0) return <Empty>Unavailable right now.</Empty>;
  return (
    <div className="rx-table-wrap">
      <table className="rx-table">
        <thead>
          <tr>
            <th className="is-rank">#</th>
            <th>Protocol</th>
            <th className="rx-hide-sm">Category</th>
            <th className="is-num">{primary === 'total24h' ? '24h' : '30d'}</th>
            <th className="is-num rx-hide-sm">7d</th>
            <th className="is-num">1d change</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => {
            return (
              <tr key={e.slug}>
                <td className="is-rank mr-num">{i + 1}</td>
                <td>
                  <ProtocolLink slug={e.slug} name={e.name} project={slugs.get(e.slug)}>
                    <Avatar src={e.logo} name={e.name} size={24} />
                  </ProtocolLink>
                </td>
                <td className="rx-hide-sm">{e.category ? <Tag>{e.category}</Tag> : null}</td>
                <td className="is-num">{formatCompactUsd(e[primary])}</td>
                <td className="is-num rx-hide-sm">{formatCompactUsd(e.total7d)}</td>
                <td className="is-num">
                  <Delta value={e.change1d} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProjectTable({
  rows,
  columns,
}: {
  rows: ReturnType<typeof projectRows>;
  columns: [string, (r: ReturnType<typeof projectRows>[number]) => ReactNode][];
}) {
  if (rows.length === 0) return <Empty>Nothing to rank right now.</Empty>;
  return (
    <div className="rx-table-wrap">
      <table className="rx-table">
        <thead>
          <tr>
            <th className="is-rank">#</th>
            <th>Project</th>
            <th className="rx-hide-sm">Categories</th>
            {columns.map(([label]) => (
              <th key={label} className="is-num">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.project.slug}>
              <td className="is-rank mr-num">{i + 1}</td>
              <td>
                <ProjectCell
                  slug={r.project.slug}
                  name={r.project.name}
                  logo={r.project.logo}
                  symbol={r.project.symbol}
                />
              </td>
              <td className="rx-hide-sm">
                <span className="rx-tags">
                  {r.project.tags.slice(0, 2).map((t) => (
                    <Tag key={t}>{t}</Tag>
                  ))}
                </span>
              </td>
              {columns.map(([label, cell]) => (
                <td key={label} className="is-num">
                  {cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
