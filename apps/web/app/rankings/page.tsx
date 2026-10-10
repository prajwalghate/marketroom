import { formatCompactUsd } from '@marketroom/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { partyHref, programHref, ProjectLink, roundHref } from '@/components/research/Entities';
import { Estimate } from '@/components/research/Evidence';
import { fmtMonth, fmtRate, shortAddress } from '@/components/research/format';
import { Avatar } from '@/components/sol/Avatar';
import { Delta, PageHead } from '@/components/sol/primitives';
import { directoryRows, investorRows, programRows, roundRows } from '@/lib/research';

export const metadata: Metadata = {
  title: 'Rankings',
  description:
    'Solana projects, investors, rounds and programs ranked — by value locked, funding, deals, round size and estimated activity.',
};

export const dynamic = 'force-dynamic';

const DAY = 86_400_000;

export default async function RankingsPage() {
  const [projects, investors, rounds, programs] = await Promise.all([
    directoryRows(),
    investorRows(),
    roundRows(),
    programRows(),
  ]);
  const yearAgo = new Date(Date.now() - 365 * DAY).toISOString().slice(0, 10);
  const top = <T,>(list: readonly T[], by: (x: T) => number | null, n = 10) =>
    [...list]
      .filter((x) => (by(x) ?? 0) > 0)
      .sort((a, b) => (by(b) ?? 0) - (by(a) ?? 0))
      .slice(0, n);

  const byTvl = top(projects, (p) => p.tvlSolana);
  const byRaised = top(projects, (p) => p.raisedUsd);
  const byGrowth = top(
    projects.filter((p) => (p.tvlSolana ?? 0) > 5e6),
    (p) => p.tvlChange7d,
  );
  const byActivity = top(projects, (p) => p.txPerHour);
  const activeInvestors = top(investors, (i) => i.last12m);
  const leadInvestors = top(investors, (i) => i.leads);
  const biggestRounds = top(
    rounds.filter((r) => r.announcedOn >= yearAgo),
    (r) => r.amountUsd,
  );
  const busiestPrograms = top(programs, (p) => p.txPerHour);

  return (
    <div className="mr-container">
      <PageHead
        title="Rankings"
        lead="The same database, ordered. Every list links to the records behind it; activity figures are estimates and say so."
      />
      <div className="rx-grid is-2">
        <Ranking
          title="Value locked on Solana"
          more="/projects?sort=tvl"
          rows={byTvl.map((p) => [
            <ProjectLink key="p" project={p} sub={p.category} />,
            formatCompactUsd(p.tvlSolana),
          ])}
        />
        <Ranking
          title="Total funding raised"
          more="/projects?sort=raised"
          rows={byRaised.map((p) => [
            <ProjectLink key="p" project={p} sub={`${p.roundCount} rounds`} />,
            formatCompactUsd(p.raisedUsd),
          ])}
        />
        <Ranking
          title="Fastest-growing value locked, 7 days"
          note="Projects over $5M"
          rows={byGrowth.map((p) => [
            <ProjectLink key="p" project={p} sub={formatCompactUsd(p.tvlSolana)} />,
            <Delta key="d" value={p.tvlChange7d} />,
          ])}
        />
        <Ranking
          title="Most active on-chain"
          note="Estimated transactions per hour across mapped programs"
          more="/projects?sort=activity"
          rows={byActivity.map((p) => [
            <ProjectLink
              key="p"
              project={p}
              sub={`${p.programCount} program${p.programCount === 1 ? '' : 's'}`}
            />,
            <Estimate key="e" method="From recent transaction signatures on a public RPC node.">
              {fmtRate(p.txPerHour)}
            </Estimate>,
          ])}
        />
        <Ranking
          title="Most active investors, 12 months"
          more="/investors?sort=recent"
          rows={activeInvestors.map((i) => [
            <Link key="i" href={partyHref(i)} className="rx-entity" prefetch={false}>
              <Avatar
                src={i.imageUrl}
                name={i.name}
                size={22}
                shape={i.type === 'person' ? 'round' : 'square'}
              />
              <span className="rx-entity-name">{i.name}</span>
            </Link>,
            `${i.last12m} deals`,
          ])}
        />
        <Ranking
          title="Most rounds led"
          more="/investors?sort=leads"
          rows={leadInvestors.map((i) => [
            <Link key="i" href={partyHref(i)} className="rx-entity" prefetch={false}>
              <Avatar
                src={i.imageUrl}
                name={i.name}
                size={22}
                shape={i.type === 'person' ? 'round' : 'square'}
              />
              <span className="rx-entity-name">{i.name}</span>
            </Link>,
            `${i.leads} led`,
          ])}
        />
        <Ranking
          title="Largest rounds, 12 months"
          more="/fundraising?sort=amount"
          rows={biggestRounds.map((r) => [
            <span key="r" className="rx-rank-round">
              <ProjectLink project={r.project} />
              <Link href={roundHref(r.slug)} className="rx-under rx-clear" prefetch={false}>
                {r.roundType ?? 'Round'} · {fmtMonth(r.announcedOn)}
              </Link>
            </span>,
            formatCompactUsd(r.amountUsd),
          ])}
        />
        <Ranking
          title="Busiest programs"
          note="Estimated from recent transaction signatures"
          more="/programs"
          rows={busiestPrograms.map((p) => [
            <span key="p" className="rx-rank-round">
              <Link href={programHref(p.address)} className="rx-strong-link" prefetch={false}>
                {p.name ?? shortAddress(p.address)}
              </Link>
              <span className="rx-under">{p.projects[0]?.name ?? 'Not mapped'}</span>
            </span>,
            <Estimate key="e" method="From recent transaction signatures on a public RPC node.">
              {fmtRate(p.txPerHour)}
            </Estimate>,
          ])}
        />
      </div>
    </div>
  );
}

function Ranking({
  title,
  rows,
  more,
  note,
}: {
  title: string;
  rows: [ReactNode, ReactNode][];
  more?: string;
  note?: string;
}) {
  return (
    <section className="rx-sec rx-ranking" aria-label={title}>
      <header className="rx-sec-head">
        <h2 className="rx-sec-title">{title}</h2>
        {more && (
          <Link href={more} className="rx-more" prefetch={false}>
            Full list →
          </Link>
        )}
      </header>
      {note && <p className="rx-sec-lead">{note}</p>}
      {rows.length === 0 ? (
        <p className="rx-empty">Not enough data yet.</p>
      ) : (
        <ol className="rx-rank">
          {rows.map(([who, value], i) => (
            <li key={i}>
              <span className="rx-rank-n mr-num">{i + 1}</span>
              <span className="rx-rank-who">{who}</span>
              <span className="rx-rank-value mr-num">{value}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
