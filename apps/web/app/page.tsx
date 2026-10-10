import type { FlowTotals, SeriesPoint, TokenMarket } from '@marketroom/core';
import {
  formatCompactUsd,
  formatCount,
  formatPrice,
  priceChange24h,
  projectRows,
} from '@marketroom/core';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  Delta,
  Empty,
  Kpi,
  MoreLink,
  Panel,
  ProjectCell,
  ShareBar,
  Tag,
} from '@/components/sol/primitives';
import {
  getChainTvl,
  getFearGreed,
  getFlows,
  getMarketIndex,
  getMarkets,
  getSolanaProjects,
  getStablecoins,
} from '@/lib/solana';
import { SOL_MINT } from '@marketroom/adapters';
import { getSnapshot } from '@/lib/data';
import { hrefWith, one, type Params } from '@/lib/query';
import { fundingTrend, roundTypeSlices } from '@/lib/funding';
import { investorRows, roundRows } from '@/lib/research';
import { PartyChip } from '@/components/research/Entities';
import { AreaSpark, Gauge, PieChart } from '@/components/charts/Charts';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { dataColor } from '@/components/charts/palette';
import { ProtocolLink } from '@/components/research/Entities';
import { Avatar } from '@/components/sol/Avatar';

/**
 * Solana overview — the platform's front page.
 *
 * Value locked, stablecoins, trading volume, fees, the token market and the
 * funding behind the ecosystem, on one screen. Each dataset arrives on its own
 * cadence from the shared cache; the slowest one (funding) streams in behind
 * the rest rather than holding the page.
 */

// Rendered per request from the shared cache, never prerendered at build: a
// build-time render would have to assemble funding inside a 60-second page
// limit. Every dataset underneath is cached, so a request costs cache reads,
// and funding streams in behind the rest via Suspense.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DAY = 24 * 60 * 60 * 1000;

/** Change between the last point and the one `days` before it. */
function changeOver(series: readonly SeriesPoint[], days: number): number | null {
  const last = series[series.length - 1];
  if (!last) return null;
  const target = last.t - days * DAY;
  const before = [...series].reverse().find((p) => p.t <= target);
  return before && before.v > 0 ? last.v / before.v - 1 : null;
}

const tail = (series: readonly SeriesPoint[], days: number) => {
  const last = series[series.length - 1];
  return last ? series.filter((p) => p.t >= last.t - days * DAY).map((p) => p.v) : [];
};

const PERIODS = [
  { id: '24h', label: '24H', days: 1, flow: 'total24h' },
  { id: '7d', label: '7D', days: 7, flow: 'total7d' },
  { id: '30d', label: '30D', days: 30, flow: 'total30d' },
] as const;
type Period = (typeof PERIODS)[number];

const ASSET_TABS = [
  { id: 'trending', label: 'Trending' },
  { id: 'ecosystem', label: 'Ecosystem tokens' },
  { id: 'stocks', label: 'Tokenized stocks' },
] as const;
type AssetTab = (typeof ASSET_TABS)[number]['id'];

/** Absolute change over the period: the last point minus the one `days` before it. */
function deltaOver(series: readonly SeriesPoint[], days: number): number | null {
  const last = series[series.length - 1];
  if (!last) return null;
  const before = [...series].reverse().find((p) => p.t <= last.t - days * DAY);
  return before ? last.v - before.v : null;
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const period: Period = PERIODS.find((x) => x.id === one(params.period)) ?? PERIODS[0];
  const assetTab: AssetTab = ASSET_TABS.find((x) => x.id === one(params.assets))?.id ?? 'trending';

  const [markets, tvl, stables, dexs, fees, revenue, fearGreed, projects, marketIndex] =
    await Promise.all([
      getMarkets(),
      getChainTvl().catch(() => [] as SeriesPoint[]),
      getStablecoins().catch(() => [] as SeriesPoint[]),
      getFlows('dexs').catch(() => null),
      getFlows('fees').catch(() => null),
      getFlows('revenue').catch(() => null),
      getFearGreed(),
      getSolanaProjects(),
      getMarketIndex(),
    ]);
  // Joined without funding: nothing above the funding panels needs rounds, and
  // waiting for them here would hold the whole page on the slowest dataset.
  const rows = projectRows(projects, marketIndex, []);
  // Every DefiLlama protocol a project rolls up (PumpSwap under pump.fun), by slug.
  const protocols = new Map(
    projects.flatMap((p) => p.sourceSlugs.map((s) => [s, p.slug] as const)),
  );

  const sol = markets.byKey[SOL_MINT] ?? null;
  const tvlNow = tvl[tvl.length - 1]?.v ?? null;
  const stablesNow = stables[stables.length - 1]?.v ?? null;
  const withToken = rows.filter((r) => r.project.symbol || r.market).length;

  const topProjects = [...rows]
    .filter((r) => r.project.tvlSolana !== null)
    .sort((a, b) => (b.project.tvlSolana ?? 0) - (a.project.tvlSolana ?? 0))
    .slice(0, 10);

  const flowTotal = (f: FlowTotals | null) => (f ? f[period.flow] : null);

  return (
    <div className="mr-container">
      {/* ── Market overview ──────────────────────────────────────────────── */}
      <SectionHead
        title="Solana market overview"
        lead="The ecosystem at a glance: value locked, stablecoins, trading, fees, tokens and the money behind the projects. Live, and sourced on every panel."
      />
      <dl className="rx-kpis">
        <Kpi
          label="SOL"
          value={formatPrice(sol?.price ?? null)}
          sub={
            <>
              <Delta value={sol?.change24h} /> 24h · {formatCompactUsd(sol?.marketCap ?? null)} cap
            </>
          }
          chart={
            sol?.sparkline.length ? (
              <AreaSpark values={sol.sparkline} label="SOL price, last 7 days" />
            ) : undefined
          }
        />
        <Kpi
          label="DeFi value locked"
          value={formatCompactUsd(tvlNow)}
          sub={
            <>
              <Delta value={changeOver(tvl, 7)} /> 7d
            </>
          }
          chart={<AreaSpark values={tail(tvl, 90)} label="Solana TVL, last 90 days" />}
          hint="Value locked in Solana DeFi protocols — DefiLlama"
        />
        <Kpi
          label="Stablecoins"
          value={formatCompactUsd(stablesNow)}
          sub={
            <>
              <Delta value={changeOver(stables, 30)} /> 30d
            </>
          }
          chart={
            <AreaSpark values={tail(stables, 90)} label="Stablecoins on Solana, last 90 days" />
          }
          hint="Stablecoins circulating on Solana — DefiLlama"
        />
        <Kpi
          label="DEX volume 24h"
          value={formatCompactUsd(dexs?.total24h ?? null)}
          sub={
            <>
              <Delta value={dexs?.change1d} /> vs. previous day
            </>
          }
          chart={
            <AreaSpark
              values={(dexs?.series ?? []).slice(-30).map((p) => p.v)}
              label="DEX volume, last 30 days"
            />
          }
        />
        <Kpi
          label="Fees 24h"
          value={formatCompactUsd(fees?.total24h ?? null)}
          sub={<>{formatCompactUsd(fees?.total30d ?? null)} in 30d</>}
          chart={
            <AreaSpark
              values={(fees?.series ?? []).slice(-30).map((p) => p.v)}
              label="Fees, last 30 days"
            />
          }
          hint="Fees paid by users of Solana protocols — DefiLlama"
        />
        <Kpi
          label="Revenue 24h"
          value={formatCompactUsd(revenue?.total24h ?? null)}
          sub={<>{formatCompactUsd(revenue?.total30d ?? null)} in 30d</>}
          hint="The share of fees protocols keep — DefiLlama"
        />
        <Kpi
          label="Fear & Greed"
          value={fearGreed ? String(fearGreed.value) : '—'}
          sub={fearGreed ? `${fearGreed.label} · whole crypto market` : 'unavailable'}
          chart={
            fearGreed ? (
              <Gauge
                value={fearGreed.value}
                label="Fear and Greed index"
                caption={fearGreed.label}
              />
            ) : undefined
          }
          hint="Market-wide sentiment, 0–100 — alternative.me. Not Solana-specific."
        />
        <Kpi
          label="Projects tracked"
          value={String(rows.length)}
          sub={`${withToken} with a token`}
          hint="Solana projects with a public on-chain footprint — DefiLlama"
        />
      </dl>

      {/* ── Capital flows ────────────────────────────────────────────────── */}
      <SectionHead
        title="Capital flows"
        lead="How money moved on Solana over the period: net change in stablecoins and value locked, and what was traded and paid in fees."
        action={<PeriodTabs params={params} current={period} />}
      />
      <dl className="rx-kpis">
        <FlowKpi
          label="Stablecoin net change"
          delta={deltaOver(stables, period.days)}
          change={changeOver(stables, period.days)}
        />
        <FlowKpi
          label="Value locked change"
          delta={deltaOver(tvl, period.days)}
          change={changeOver(tvl, period.days)}
        />
        <Kpi label={`DEX volume ${period.label}`} value={formatCompactUsd(flowTotal(dexs))} />
        <Kpi label={`Fees ${period.label}`} value={formatCompactUsd(flowTotal(fees))} />
        <Kpi label={`Revenue ${period.label}`} value={formatCompactUsd(flowTotal(revenue))} />
      </dl>

      {/* ── Trending assets ──────────────────────────────────────────────── */}
      <SectionHead
        title="Trending assets"
        lead="Tokens on Solana right now — Jupiter's trending list, the ecosystem's own project tokens, and tokenized stocks."
        action={<AssetTabs params={params} current={assetTab} />}
      />
      <div className="rx-panel" style={{ marginBottom: 14 }}>
        <TrendingAssets tab={assetTab} markets={markets} rows={rows} />
      </div>

      {/* ── Market share & revenue ───────────────────────────────────────── */}
      <div className="rx-grid is-2">
        <ShareOfVolume dexs={dexs} protocols={protocols} />
        <RevenueOverview revenue={revenue} period={period} protocols={protocols} />
      </div>

      {/* ── Projects ─────────────────────────────────────────────────────── */}
      <div className="rx-grid is-2">
        <Panel
          title="Top projects by value locked"
          action={<MoreLink href="/projects">All projects</MoreLink>}
        >
          <div className="rx-table-wrap">
            <table className="rx-table">
              <thead>
                <tr>
                  <th className="is-rank">#</th>
                  <th>Project</th>
                  <th className="rx-hide-sm">Tags</th>
                  <th className="is-num">TVL</th>
                  <th className="is-num">7d</th>
                </tr>
              </thead>
              <tbody>
                {topProjects.map((r, i) => (
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
                    <td className="is-num">{formatCompactUsd(r.project.tvlSolana)}</td>
                    <td className="is-num">
                      <Delta value={r.project.tvlChange7d} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <FlowPanel
          title="Fees leaders"
          flows={fees}
          protocols={protocols}
          href="/discover?tab=fees"
          more="More rankings"
        />
      </div>

      {/* ── Funding ──────────────────────────────────────────────────────── */}
      <SectionHead
        title="Funding"
        lead="Disclosed rounds for Solana projects, and the investors behind them."
      />
      <Suspense fallback={<FundingFallback />}>
        <FundingPanels />
      </Suspense>

      {/* ── Liquidity history ────────────────────────────────────────────── */}
      <SectionHead
        title="Value and liquidity"
        lead="Two years of value locked in Solana DeFi and stablecoins circulating on Solana."
      />
      <div className="rx-grid is-2">
        <Panel title="Value locked">
          <TimeSeriesChart
            points={tvl}
            kind="usd"
            label="Solana DeFi value locked"
            note="Daily, from DefiLlama."
          />
        </Panel>
        <Panel title="Stablecoin supply">
          <TimeSeriesChart
            points={stables}
            kind="usd"
            label="Stablecoins circulating on Solana"
            note="Daily, from DefiLlama."
          />
        </Panel>
      </div>
    </div>
  );
}

function SectionHead({
  title,
  lead,
  action,
}: {
  title: string;
  lead?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="rx-section-head">
      <div>
        <h2 className="rx-section-title">{title}</h2>
        {lead && <p className="rx-section-lead">{lead}</p>}
      </div>
      {action}
    </header>
  );
}

function PeriodTabs({ params, current }: { params: Params; current: Period }) {
  return (
    <nav className="rx-tabs is-compact" aria-label="Period">
      {PERIODS.map((x) => (
        <Link
          key={x.id}
          href={hrefWith('/', params, { period: x.id === '24h' ? null : x.id })}
          aria-current={x.id === current.id ? 'page' : undefined}
          scroll={false}
          prefetch={false}
        >
          {x.label}
        </Link>
      ))}
    </nav>
  );
}

function AssetTabs({ params, current }: { params: Params; current: AssetTab }) {
  return (
    <nav className="rx-tabs is-compact" aria-label="Asset category">
      {ASSET_TABS.map((x) => (
        <Link
          key={x.id}
          href={hrefWith('/', params, { assets: x.id === 'trending' ? null : x.id })}
          aria-current={x.id === current ? 'page' : undefined}
          scroll={false}
          prefetch={false}
        >
          {x.label}
        </Link>
      ))}
    </nav>
  );
}

function FlowKpi({
  label,
  delta,
  change,
}: {
  label: string;
  delta: number | null;
  change: number | null;
}) {
  const sign = delta === null ? '' : delta > 0 ? '+' : delta < 0 ? '−' : '';
  return (
    <Kpi
      label={label}
      value={
        delta === null ? (
          '—'
        ) : (
          <span className={delta > 0 ? 'rx-up' : delta < 0 ? 'rx-down' : undefined}>
            {sign}
            {formatCompactUsd(Math.abs(delta))}
          </span>
        )
      }
      sub={
        <>
          <Delta value={change} /> over the period
        </>
      }
    />
  );
}

async function TrendingAssets({
  tab,
  markets,
  rows,
}: {
  tab: AssetTab;
  markets: Awaited<ReturnType<typeof getMarkets>>;
  rows: ReturnType<typeof projectRows>;
}) {
  if (tab === 'stocks') return <StockAssets />;

  let list: { market: TokenMarket; slug: string | null }[];
  if (tab === 'trending') {
    const bySlugMint = new Map(
      rows.filter((r) => r.project.tokenMint).map((r) => [r.project.tokenMint!, r.project.slug]),
    );
    list = markets.trending
      .map((k) => markets.byKey[k])
      .filter(
        (m): m is TokenMarket =>
          !!m && m.key !== SOL_MINT && m.verified === true && (m.marketCap ?? 0) > 1e6,
      )
      .slice(0, 15)
      .map((m) => ({ market: m, slug: m.mint ? (bySlugMint.get(m.mint) ?? null) : null }));
  } else {
    list = rows
      .filter((r) => r.market && (r.market.volume24h ?? 0) > 0)
      .sort((a, b) => (b.market!.volume24h ?? 0) - (a.market!.volume24h ?? 0))
      .slice(0, 15)
      .map((r) => ({ market: r.market!, slug: r.project.slug }));
  }
  if (list.length === 0) return <Empty>Token markets are unavailable right now.</Empty>;

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
          {list.map(({ market: m, slug }, i) => (
            <tr key={m.key}>
              <td className="is-rank mr-num">{i + 1}</td>
              <td>
                {slug || m.mint ? (
                  <Link
                    href={slug ? `/projects/${slug}` : `/tokens/${m.mint}`}
                    className="rx-entity"
                    prefetch={false}
                  >
                    <TokenName market={m} />
                  </Link>
                ) : (
                  <TokenName market={m} />
                )}
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

/** Solana xStocks, from the tokenized-assets section's own snapshot. */
async function StockAssets() {
  const snapshot = await getSnapshot().catch(() => null);
  const stocks = (snapshot?.assets ?? [])
    .flatMap((view) =>
      view.listings
        .filter(({ listing, quote }) => listing.venue === 'solana' && quote)
        .map(({ quote }) => ({ view, quote: quote! })),
    )
    .sort((a, b) => (b.quote.volume24h ?? 0) - (a.quote.volume24h ?? 0))
    .slice(0, 15);
  if (stocks.length === 0) return <Empty>Tokenized stock markets are unavailable right now.</Empty>;
  return (
    <div className="rx-table-wrap">
      <table className="rx-table">
        <thead>
          <tr>
            <th className="is-rank">#</th>
            <th>Stock</th>
            <th className="is-num">Price</th>
            <th className="is-num">24h</th>
            <th className="is-num rx-hide-sm">Volume 24h</th>
            <th className="is-num rx-hide-sm">Liquidity</th>
            <th className="is-num rx-hide-sm">Holders</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map(({ view, quote }, i) => {
            const change = priceChange24h(quote);
            return (
              <tr key={view.asset.id}>
                <td className="is-rank mr-num">{i + 1}</td>
                <td>
                  <Link href={`/market/${view.asset.id}`} className="rx-entity" prefetch={false}>
                    <span className="rx-entity-name">{view.asset.name}</span>
                    <span className="rx-entity-sym mr-num">{view.asset.symbol}x</span>
                  </Link>
                </td>
                <td className="is-num">{formatPrice(quote.price)}</td>
                <td className="is-num">
                  <Delta value={change?.fraction ?? null} />
                </td>
                <td className="is-num rx-hide-sm">{formatCompactUsd(quote.volume24h)}</td>
                <td className="is-num rx-hide-sm">{formatCompactUsd(quote.liquidity)}</td>
                <td className="is-num rx-hide-sm">{formatCount(quote.holders)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ShareOfVolume({
  dexs,
  protocols,
}: {
  dexs: FlowTotals | null;
  protocols: ReadonlyMap<string, string>;
}) {
  const total = dexs?.total24h ?? 0;
  const active = (dexs?.entries ?? []).filter((e) => (e.total24h ?? 0) > 0);
  const top = active.slice(0, 5);
  const topSum = top.reduce((s, e) => s + (e.total24h ?? 0), 0);
  return (
    <Panel
      title="Exchange market share · 24h"
      action={<MoreLink href="/exchanges">All exchanges</MoreLink>}
    >
      {!total || top.length === 0 ? (
        <Empty>Exchange volumes are unavailable right now.</Empty>
      ) : (
        <>
          <p className="rx-prose" style={{ marginBottom: 10 }}>
            <strong className="mr-num">{formatCompactUsd(total)}</strong> traded across{' '}
            {active.length} venues; the top five handled{' '}
            <strong className="mr-num">{((topSum / total) * 100).toFixed(1)}%</strong>.
          </p>
          <ol className="rx-breakdown">
            {[...top, { slug: 'others', name: 'Other venues', total24h: total - topSum }].map(
              (e) => (
                <li key={e.slug}>
                  {e.slug === 'others' ? (
                    <span>{e.name}</span>
                  ) : (
                    <ProtocolLink slug={e.slug} name={e.name} project={protocols.get(e.slug)} />
                  )}
                  <ShareBar fraction={(e.total24h ?? 0) / total} />
                  <span className="mr-num" style={{ minWidth: 56 }}>
                    {(((e.total24h ?? 0) / total) * 100).toFixed(1)}%
                  </span>
                </li>
              ),
            )}
          </ol>
        </>
      )}
    </Panel>
  );
}

function RevenueOverview({
  revenue,
  period,
  protocols,
}: {
  revenue: FlowTotals | null;
  period: Period;
  protocols: ReadonlyMap<string, string>;
}) {
  const entries = [...(revenue?.entries ?? [])]
    .filter((e) => (e[period.flow] ?? 0) > 0)
    .sort((a, b) => (b[period.flow] ?? 0) - (a[period.flow] ?? 0));
  const total = entries.reduce((s, e) => s + (e[period.flow] ?? 0), 0);
  const byCategory = new Map<string, number>();
  for (const e of entries)
    byCategory.set(
      e.category ?? 'Other',
      (byCategory.get(e.category ?? 'Other') ?? 0) + (e[period.flow] ?? 0),
    );
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return (
    <Panel
      title={`Revenue overview · ${period.label}`}
      action={<MoreLink href="/discover?tab=revenue">Rankings</MoreLink>}
    >
      {total === 0 ? (
        <Empty>Revenue data is unavailable right now.</Empty>
      ) : (
        <div className="rx-split">
          <ol className="rx-breakdown">
            {entries.slice(0, 6).map((e) => (
              <li key={e.slug}>
                <ProtocolLink slug={e.slug} name={e.name} project={protocols.get(e.slug)} />
                <ShareBar fraction={(e[period.flow] ?? 0) / total} />
                <span className="mr-num" style={{ minWidth: 64 }}>
                  {formatCompactUsd(e[period.flow])}
                </span>
              </li>
            ))}
          </ol>
          <div>
            <p className="rx-split-title">By category</p>
            <ol className="rx-breakdown">
              {categories.map(([category, value]) => (
                <li key={category}>
                  <span>{category}</span>
                  <ShareBar fraction={value / total} />
                  <span className="mr-num" style={{ minWidth: 44 }}>
                    {((value / total) * 100).toFixed(0)}%
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Panel>
  );
}

function TokenName({ market }: { market: TokenMarket }) {
  return (
    <span className="rx-entity">
      <Avatar src={market.image ?? null} name={market.symbol} size={22} />
      <span className="rx-entity-name">{market.name}</span>
      <span className="rx-entity-sym mr-num">{market.symbol}</span>
    </span>
  );
}

function FlowPanel({
  title,
  flows,
  protocols,
  href,
  more,
}: {
  title: string;
  flows: FlowTotals | null;
  protocols: ReadonlyMap<string, string>;
  href: string;
  more: string;
}) {
  const top = flows?.entries.slice(0, 8) ?? [];
  const total = flows?.total24h ?? null;
  return (
    <Panel title={title} action={<MoreLink href={href}>{more}</MoreLink>}>
      {top.length === 0 ? (
        <Empty>Unavailable right now.</Empty>
      ) : (
        // Nothing inside is focusable, so the wrapper is: on a phone it scrolls.
        <div className="rx-table-wrap" role="region" aria-label={title} tabIndex={0}>
          <table className="rx-table">
            <thead>
              <tr>
                <th>Protocol</th>
                <th className="is-num">24h</th>
                <th className="rx-hide-sm">Share</th>
                <th className="is-num">1d</th>
              </tr>
            </thead>
            <tbody>
              {top.map((e) => (
                <tr key={e.slug}>
                  <td>
                    <ProtocolLink slug={e.slug} name={e.name} project={protocols.get(e.slug)}>
                      <Avatar src={e.logo ?? null} name={e.name} size={22} shape="square" />
                    </ProtocolLink>
                  </td>
                  <td className="is-num">{formatCompactUsd(e.total24h)}</td>
                  <td className="rx-hide-sm">
                    {total && e.total24h ? <ShareBar fraction={e.total24h / total} /> : null}
                  </td>
                  <td className="is-num">
                    <Delta value={e.change1d} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

async function FundingPanels() {
  const [rounds, investors] = await Promise.all([roundRows(), investorRows()]);
  const now = Date.now();
  const yearAgo = new Date(now - 365 * DAY).toISOString().slice(0, 10);
  const lastYear = rounds.filter((r) => r.announcedOn >= yearAgo);
  const disclosed = lastYear.filter((r) => r.amountUsd !== null);
  const largest = [...disclosed].sort((a, b) => b.amountUsd! - a.amountUsd!)[0] ?? null;

  const trend = fundingTrend(rounds, 24, 6, now);
  const { series, counts } = trend;
  const typeSlices = roundTypeSlices(lastYear);
  const active = [...investors]
    .sort((a, b) => b.last12m - a.last12m || b.deals - a.deals)
    .slice(0, 8);
  const maxActive = Math.max(1, ...active.map((i) => i.last12m));

  return (
    <>
      <dl className="rx-kpis">
        <div className="rx-kpi">
          <dt className="rx-kpi-label">Rounds, last 12 months</dt>
          <dd className="rx-kpi-body">
            <span className="rx-kpi-value mr-num">{lastYear.length}</span>
            <span className="rx-kpi-sub">{disclosed.length} with a disclosed amount</span>
            <span className="rx-kpi-chart">
              <AreaSpark
                values={counts.slice(-12)}
                tone="accent"
                label="Rounds per month, last 12 months"
              />
            </span>
          </dd>
        </div>
        <div className="rx-kpi">
          <dt className="rx-kpi-label">Disclosed, last 12 months</dt>
          <dd className="rx-kpi-body">
            <span className="rx-kpi-value mr-num">
              {formatCompactUsd(disclosed.reduce((s, r) => s + r.amountUsd!, 0))}
            </span>
            <span className="rx-kpi-sub">
              {largest ? (
                <>
                  Largest: <Link href={`/rounds/${largest.slug}`}>{largest.project.name}</Link>{' '}
                  {formatCompactUsd(largest.amountUsd)}
                </>
              ) : (
                'No disclosed rounds'
              )}
            </span>
            <span className="rx-kpi-chart">
              <AreaSpark
                values={trend.totals.slice(-12)}
                tone="accent"
                label="Disclosed funding per month, last 12 months"
              />
            </span>
          </dd>
        </div>
        <div className="rx-kpi">
          <dt className="rx-kpi-label">Active investors, 12 months</dt>
          <dd className="rx-kpi-body">
            <span className="rx-kpi-value mr-num">
              {investors.filter((i) => i.last12m > 0).length}
            </span>
            <span className="rx-kpi-sub">named in at least one round</span>
          </dd>
        </div>
        <div className="rx-kpi">
          <dt className="rx-kpi-label">Investors on record</dt>
          <dd className="rx-kpi-body">
            <span className="rx-kpi-value mr-num">{investors.length.toLocaleString('en-US')}</span>
            <span className="rx-kpi-sub">funds, firms and angels</span>
          </dd>
        </div>
      </dl>

      <div className="rx-grid is-2-1">
        <Panel
          title="Funding trend by category"
          action={<MoreLink href="/fundraising">All rounds</MoreLink>}
        >
          <ColumnChart
            labels={trend.labels}
            series={series}
            line={{ label: 'Rounds', values: counts }}
            format="usd"
            lineFormat="count"
            height={330}
            label="Disclosed funding per month by project category, with the number of rounds"
          />
        </Panel>
        <Panel title="Rounds by type, 12 months">
          <PieChart
            slices={typeSlices}
            label="Funding rounds by type, last 12 months"
            inner={0.62}
            size={170}
            center={{ value: String(lastYear.length), caption: 'rounds' }}
          />
        </Panel>
      </div>

      <div className="rx-grid is-2">
        <Panel title="Latest rounds" action={<MoreLink href="/fundraising">Fundraising</MoreLink>}>
          {rounds.length === 0 ? (
            <Empty>No rounds imported yet.</Empty>
          ) : (
            <ul className="rx-roundlist">
              {rounds.slice(0, 7).map((r) => (
                <li key={r.id}>
                  <Avatar src={r.project.logoUrl} name={r.project.name} size={32} shape="square" />
                  <span className="rx-roundlist-main">
                    <Link href={`/projects/${r.project.slug}`} className="rx-clear-strong">
                      {r.project.name}
                    </Link>
                    <span className="rx-roundlist-sub">
                      <Link href={`/rounds/${r.slug}`} className="rx-type-chip">
                        {r.roundType ?? 'Round'}
                      </Link>
                      {r.investors.slice(0, 3).map((i) => (
                        <span
                          key={`${i.type}:${i.slug}`}
                          className="rx-roundlist-inv"
                          title={i.name}
                        >
                          <Avatar
                            src={i.imageUrl}
                            name={i.name}
                            size={16}
                            shape={i.type === 'person' ? 'round' : 'square'}
                          />
                          <span className="rx-roundlist-inv-name">{i.name}</span>
                          {i.isLead && <span className="rx-lead-tag">Lead</span>}
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className="rx-roundlist-amount">
                    <strong className="mr-num">
                      {r.amountUsd ? formatCompactUsd(r.amountUsd) : 'Undisclosed'}
                    </strong>
                    <span className="rx-muted">
                      {new Date(`${r.announcedOn}T00:00:00Z`).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        timeZone: 'UTC',
                      })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Most active investors, 12 months"
          action={<MoreLink href="/investors">All investors</MoreLink>}
        >
          {active.length === 0 ? (
            <Empty>No investors yet.</Empty>
          ) : (
            <ol className="rx-activeinv">
              {active.map((i, n) => (
                <li key={`${i.type}:${i.slug}`}>
                  <span className="rx-rank-n mr-num">{n + 1}</span>
                  <PartyChip party={i} />
                  <span className="rx-activeinv-bar" aria-hidden="true">
                    <span
                      style={{
                        width: `${(i.last12m / maxActive) * 100}%`,
                        background: dataColor(n),
                      }}
                    />
                  </span>
                  <span className="mr-num">
                    {i.last12m}{' '}
                    <span className="rx-muted">{i.last12m === 1 ? 'round' : 'rounds'}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </>
  );
}

function FundingFallback() {
  return (
    <div className="rx-grid is-3" aria-busy="true">
      {['Funding by month', 'Latest rounds', 'Most active investors'].map((t) => (
        <Panel key={t} title={t}>
          <Empty>Assembling funding data from every project&rsquo;s record…</Empty>
        </Panel>
      ))}
    </div>
  );
}
