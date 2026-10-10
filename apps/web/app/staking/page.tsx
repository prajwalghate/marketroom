import { SOL_MINT } from '@marketroom/adapters';
import { formatCompactUsd, formatCount, formatPercentAdaptive } from '@marketroom/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Avatar } from '@/components/sol/Avatar';
import { Empty, Kpi, PageHead, Panel, ShareBar, Tag } from '@/components/sol/primitives';
import { getMarkets, getStakePools, type StakePoolView } from '@/lib/solana';
import { hrefWith, one, type Params } from '@/lib/query';

export const metadata: Metadata = {
  title: 'Staking',
  description:
    'Every liquid-staking pool on Solana — SOL staked, yield, fees and validator spread.',
};

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = '/staking';
const SORTS = [
  { id: 'stake', label: 'Most staked' },
  { id: 'apy', label: 'Highest yield' },
  { id: 'validators', label: 'Most validators' },
] as const;

const nameOf = (p: StakePoolView) =>
  p.name ?? p.token?.name ?? `${p.address.slice(0, 4)}…${p.address.slice(-4)}`;
const pct = (f: number | null) => (f === null ? '—' : formatPercentAdaptive(f));

export default async function StakingPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const sort = SORTS.find((s) => s.id === one(params.sort))?.id ?? 'stake';
  const showStale = one(params.stale) === '1';
  const [pools, markets] = await Promise.all([getStakePools().catch(() => null), getMarkets()]);

  if (!pools || pools.length === 0) {
    return (
      <div className="mr-container">
        <PageHead title="Staking" />
        <Empty>Staking data is unavailable right now. Try again in a minute.</Empty>
      </div>
    );
  }

  const solPrice = markets.byKey[SOL_MINT]?.price ?? null;
  const live = pools.filter((p) => (p.solStaked ?? 0) > 0);
  const totalSol = live.reduce((s, p) => s + (p.solStaked ?? 0), 0);
  // Stake-weighted, so one tiny pool with a freak rate cannot set the headline.
  const weighted = live.filter((p) => p.apy !== null && p.apy > 0 && p.apy < 0.5);
  const weightSum = weighted.reduce((s, p) => s + (p.solStaked ?? 0), 0);
  const avgApy = weightSum
    ? weighted.reduce((s, p) => s + p.apy! * (p.solStaked ?? 0), 0) / weightSum
    : null;
  const largest = live[0];

  const listed = pools
    .filter((p) => showStale || !p.stale)
    .filter((p) => (p.solStaked ?? 0) >= 1)
    .sort((a, b) =>
      sort === 'apy'
        ? (b.apy ?? -1) - (a.apy ?? -1)
        : sort === 'validators'
          ? (b.validators ?? -1) - (a.validators ?? -1)
          : (b.solStaked ?? 0) - (a.solStaked ?? 0),
    );
  const staleCount = pools.filter((p) => p.stale).length;

  return (
    <div className="mr-container">
      <PageHead
        title="Staking"
        lead="Liquid staking on Solana: how much SOL each pool holds, what it yields, what it charges, and how widely it spreads stake across validators."
        meta={
          <>
            Data:{' '}
            <a
              href="https://solanacompass.com"
              target="_blank"
              rel="noopener noreferrer"
              className="rx-clear"
            >
              Solana Compass
            </a>{' '}
            · tokens from Jupiter
          </>
        }
      />

      <dl className="rx-kpis">
        <Kpi
          label="SOL in liquid staking"
          value={`${formatCount(totalSol)} SOL`}
          sub={solPrice ? `${formatCompactUsd(totalSol * solPrice)} at today's price` : undefined}
        />
        <Kpi
          label="Pools"
          value={String(live.length)}
          sub={staleCount ? `${staleCount} with stale data` : 'all up to date'}
        />
        <Kpi label="Stake-weighted yield" value={pct(avgApy)} sub="annualised, before fees" />
        <Kpi
          label="Largest pool"
          value={largest ? nameOf(largest) : '—'}
          sub={
            largest && totalSol
              ? `${(((largest.solStaked ?? 0) / totalSol) * 100).toFixed(1)}% of liquid-staked SOL`
              : undefined
          }
        />
      </dl>

      <Panel
        title={`Pools · ${listed.length}`}
        action={
          <nav className="rx-tabs is-compact" aria-label="Sort and filter">
            {SORTS.map((s) => (
              <Link
                key={s.id}
                href={hrefWith(BASE, params, { sort: s.id === 'stake' ? null : s.id })}
                aria-current={sort === s.id ? 'page' : undefined}
                scroll={false}
                prefetch={false}
              >
                {s.label}
              </Link>
            ))}
            <Link
              href={hrefWith(BASE, params, { stale: showStale ? null : '1' })}
              aria-current={showStale ? 'page' : undefined}
              scroll={false}
              prefetch={false}
            >
              {showStale ? 'Hiding none' : 'Show stale'}
            </Link>
          </nav>
        }
      >
        <div className="rx-table-wrap">
          <table className="rx-table">
            <thead>
              <tr>
                <th className="is-rank">#</th>
                <th>Pool</th>
                <th className="is-num">SOL staked</th>
                <th className="rx-hide-sm">Share</th>
                <th className="is-num">Yield</th>
                <th className="is-num rx-hide-sm">Epoch fee</th>
                <th className="is-num rx-hide-sm">Withdrawal fee</th>
                <th className="is-num rx-hide-sm">Validators</th>
                <th className="is-num rx-hide-sm">Holders</th>
              </tr>
            </thead>
            <tbody>
              {listed.map((p, i) => (
                <tr key={p.address}>
                  <td className="is-rank mr-num">{i + 1}</td>
                  <td>
                    <span className="rx-entity">
                      <Avatar src={p.token?.image ?? p.logo} name={nameOf(p)} size={24} />
                      <span className="rx-entity-name">
                        {p.website ? (
                          <a
                            href={p.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'inherit' }}
                          >
                            {nameOf(p)}
                          </a>
                        ) : (
                          nameOf(p)
                        )}
                      </span>
                      {p.token?.symbol && (
                        <span className="rx-entity-sym mr-num">{p.token.symbol}</span>
                      )}
                      {p.stale && <Tag>stale</Tag>}
                    </span>
                  </td>
                  <td className="is-num">{formatCount(p.solStaked)}</td>
                  <td className="rx-hide-sm">
                    {totalSol ? <ShareBar fraction={(p.solStaked ?? 0) / totalSol} /> : null}
                  </td>
                  <td className="is-num">{pct(p.apy)}</td>
                  <td className="is-num rx-hide-sm">{pct(p.epochFee)}</td>
                  <td className="is-num rx-hide-sm">{pct(p.withdrawFee)}</td>
                  <td className="is-num rx-hide-sm">{formatCount(p.validators)}</td>
                  <td className="is-num rx-hide-sm">{formatCount(p.token?.holders ?? null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
