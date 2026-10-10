import type { FlowEntry } from '@marketroom/core';
import { formatCompactUsd } from '@marketroom/core';
import type { Metadata } from 'next';
import { ProtocolLink } from '@/components/research/Entities';
import { Avatar } from '@/components/sol/Avatar';
import {
  AreaChart,
  Delta,
  Empty,
  Kpi,
  PageHead,
  Panel,
  ShareBar,
} from '@/components/sol/primitives';
import { getFlows, getProjectSlugIndex } from '@/lib/solana';

export const metadata: Metadata = {
  title: 'Exchanges',
  description:
    'Every decentralised exchange on Solana, ranked by trading volume, with each one’s share of the chain.',
};

export const revalidate = 900;

export default async function ExchangesPage() {
  const [dexs, slugs] = await Promise.all([
    getFlows('dexs').catch(() => null),
    getProjectSlugIndex(),
  ]);

  if (!dexs) {
    return (
      <div className="mr-container">
        <PageHead title="Exchanges" />
        <Empty>Exchange volumes are unavailable right now. Try again in a minute.</Empty>
      </div>
    );
  }

  const active = dexs.entries.filter((e) => (e.total24h ?? 0) > 0);
  const total = dexs.total24h ?? 0;
  const top = active[0];
  const topThreeShare = total
    ? active.slice(0, 3).reduce((s, e) => s + (e.total24h ?? 0), 0) / total
    : null;

  return (
    <div className="mr-container">
      <PageHead
        title="Exchanges"
        lead="Decentralised exchanges on Solana, ranked by what traded through them. Volume is each venue's own, as DefiLlama counts it — aggregators route through these venues and are not double-counted here."
        meta="DefiLlama · refreshed every 15 minutes"
      />

      <dl className="rx-kpis">
        <Kpi
          label="Volume 24h"
          value={formatCompactUsd(dexs.total24h)}
          sub={
            <>
              <Delta value={dexs.change1d} /> vs. previous day
            </>
          }
        />
        <Kpi label="Volume 7d" value={formatCompactUsd(dexs.total7d)} />
        <Kpi label="Volume 30d" value={formatCompactUsd(dexs.total30d)} />
        <Kpi
          label="Largest venue"
          value={top ? top.name : '—'}
          sub={
            top && total
              ? `${((top.total24h! / total) * 100).toFixed(1)}% of 24h volume`
              : undefined
          }
        />
        <Kpi
          label="Active venues"
          value={String(active.length)}
          sub={
            topThreeShare !== null
              ? `top three: ${(topThreeShare * 100).toFixed(0)}% of volume`
              : undefined
          }
        />
      </dl>

      <Panel title="Daily DEX volume, two years">
        <AreaChart
          series={dexs.series}
          label="Solana DEX volume per day"
          format={(v) => formatCompactUsd(v)}
        />
      </Panel>

      <div style={{ marginTop: 14 }}>
        <Panel title={`Venues · ${active.length}`}>
          {active.length === 0 ? (
            <Empty>No venue reported volume in the last day.</Empty>
          ) : (
            <div className="rx-table-wrap">
              <table className="rx-table">
                <thead>
                  <tr>
                    <th className="is-rank">#</th>
                    <th>Exchange</th>
                    <th className="is-num">Volume 24h</th>
                    <th className="rx-hide-sm">Share</th>
                    <th className="is-num">1d</th>
                    <th className="is-num rx-hide-sm">Volume 7d</th>
                    <th className="is-num rx-hide-sm">7d</th>
                    <th className="is-num rx-hide-sm">Volume 30d</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((e, i) => (
                    <Row
                      key={e.slug}
                      entry={e}
                      rank={i + 1}
                      total={total}
                      projectSlug={slugs.get(e.slug) ?? null}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Row({
  entry: e,
  rank,
  total,
  projectSlug,
}: {
  entry: FlowEntry;
  rank: number;
  total: number;
  projectSlug: string | null;
}) {
  return (
    <tr>
      <td className="is-rank mr-num">{rank}</td>
      <td>
        <ProtocolLink slug={e.slug} name={e.name} project={projectSlug}>
          <Avatar src={e.logo} name={e.name} size={24} />
        </ProtocolLink>
      </td>
      <td className="is-num">{formatCompactUsd(e.total24h)}</td>
      <td className="rx-hide-sm">
        {total && e.total24h ? (
          <>
            <ShareBar fraction={e.total24h / total} />{' '}
            <span className="mr-num rx-muted" style={{ fontSize: 'var(--mr-text-2xs)' }}>
              {((e.total24h / total) * 100).toFixed(1)}%
            </span>
          </>
        ) : null}
      </td>
      <td className="is-num">
        <Delta value={e.change1d} />
      </td>
      <td className="is-num rx-hide-sm">{formatCompactUsd(e.total7d)}</td>
      <td className="is-num rx-hide-sm">
        <Delta value={e.change7d} />
      </td>
      <td className="is-num rx-hide-sm">{formatCompactUsd(e.total30d)}</td>
    </tr>
  );
}
