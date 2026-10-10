import { formatCompactUsd, formatCount, formatPrice } from '@marketroom/core';
import { loadTokenProfile } from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CopyAddress } from '@/components/CopyAddress';
import { ProjectLink } from '@/components/research/Entities';
import { ReviewBadge, Sources, Stamp } from '@/components/research/Evidence';
import { ago, fmtDay, fmtStamp } from '@/components/research/format';
import {
  AsideCard,
  Breadcrumbs,
  Facts,
  HeroStat,
  ProfileHero,
  ProfileLayout,
  Section,
} from '@/components/research/Profile';
import { WatchButton } from '@/components/sol/Watchlist';
import { AreaChart, Delta, Empty } from '@/components/sol/primitives';
import { currentEditor } from '@/lib/admin';
import { researchDb } from '@/lib/research';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ mint: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { mint } = await params;
  const profile = await loadTokenProfile(await researchDb(), mint).catch(() => null);
  if (!profile) return { title: 'Token' };
  return {
    title: `${profile.token.symbol ?? 'Token'}${profile.project ? ` · ${profile.project.name}` : ''}`,
    description: `${profile.token.name ?? profile.token.symbol ?? 'Token'} on Solana: price, market cap, volume, liquidity and holders, with the provider and time of each.`,
  };
}

export default async function TokenPage({ params }: Props) {
  const { mint } = await params;
  const [profile, editor] = await Promise.all([
    researchDb().then((db) => loadTokenProfile(db, mint)),
    currentEditor(),
  ]);
  if (!profile) notFound();
  const { token, project, history } = profile;
  const m = token.market;
  const priced = history.filter((h) => h.price !== null).map((h) => ({ t: h.t, v: h.price! }));

  return (
    <div className="mr-container">
      <Breadcrumbs
        items={[
          { label: 'Tokens', href: '/tokens' },
          ...(project ? [{ label: project.name, href: `/projects/${project.slug}` }] : []),
          { label: token.symbol ?? 'Token' },
        ]}
      />
      <ProfileHero
        image={token.logoUrl}
        name={token.symbol ?? token.mint}
        title={token.symbol ?? 'Unnamed token'}
        extra={token.name ? <span className="rx-hero-dim">{token.name}</span> : null}
        badges={
          <ReviewBadge
            status={token.reviewStatus}
            checkedAt={token.checkedAt}
            checkedBy={token.checkedBy}
          />
        }
        subtitle={
          project ? (
            <>
              Token of <ProjectLink project={project} size={18} />
            </>
          ) : (
            'Not yet mapped to a project.'
          )
        }
        links={
          <>
            <CopyAddress address={token.mint} />
            <a
              className="rx-pill"
              href={`https://solscan.io/token/${token.mint}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Solscan<span className="sr-only"> (opens in a new tab)</span>
            </a>
            <a
              className="rx-pill"
              href={`https://jup.ag/tokens/${token.mint}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Jupiter<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </>
        }
        actions={
          <>
            <WatchButton kind="token" slug={token.mint} name={token.symbol ?? token.mint} />
            {editor && (
              <Link
                className="rx-link is-editor"
                href={`/admin/edit/token/${token.id}`}
                prefetch={false}
              >
                Edit token
              </Link>
            )}
          </>
        }
        stats={
          m ? (
            <>
              <HeroStat
                label="Price"
                value={formatPrice(m.price)}
                sub={<Delta value={m.change24h} />}
              />
              <HeroStat label="Market cap" value={formatCompactUsd(m.marketCap)} />
              <HeroStat label="FDV" value={formatCompactUsd(m.fdv)} />
              <HeroStat label="Volume 24h" value={formatCompactUsd(m.volume24h)} />
              <HeroStat
                label="Holders"
                value={formatCount(m.holders)}
                sub={
                  <Stamp provider={m.provider} at={m.capturedAt} providerAt={m.providerUpdatedAt} />
                }
              />
            </>
          ) : null
        }
      />
      <ProfileLayout
        main={
          <>
            <Section
              id="price"
              title="Price history"
              lead="From this site’s own snapshots of the provider’s figures — every few minutes for two days, then hourly."
            >
              {priced.length < 2 ? (
                <Empty>Not enough snapshots yet for a chart.</Empty>
              ) : (
                <AreaChart
                  series={priced}
                  label={`${token.symbol ?? 'Token'} price`}
                  format={(v) => formatPrice(v)}
                />
              )}
            </Section>
            <Section id="market" title="Market">
              {!m ? (
                <Empty>No market data yet.</Empty>
              ) : (
                <>
                  <dl className="rx-metrics">
                    {[
                      ['Price', formatPrice(m.price)],
                      ['Change 24h', <Delta key="d" value={m.change24h} />],
                      ['Market cap', formatCompactUsd(m.marketCap)],
                      ['Fully diluted', formatCompactUsd(m.fdv)],
                      ['Volume 24h', formatCompactUsd(m.volume24h)],
                      ['Liquidity', formatCompactUsd(m.liquidity)],
                      ['Holders', formatCount(m.holders)],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rx-metric">
                        <dt>{label}</dt>
                        <dd>
                          <span className="mr-num">{value}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="rx-footnote">
                    As reported by {m.provider}
                    {m.providerUpdatedAt ? ` at ${fmtStamp(m.providerUpdatedAt)}` : ''}; fetched{' '}
                    {ago(m.capturedAt)}. Market cap and holders are the provider’s figures, not
                    ours.
                  </p>
                </>
              )}
            </Section>
          </>
        }
        aside={
          <AsideCard title="Token">
            <Facts
              items={[
                { label: 'Mint', value: <CopyAddress address={token.mint} /> },
                {
                  label: 'Standard',
                  value:
                    token.standard === 'token-2022'
                      ? 'Token-2022'
                      : token.standard === 'spl'
                        ? 'SPL token'
                        : null,
                },
                { label: 'Decimals', value: token.decimals },
                { label: 'Created', value: token.launchedAt ? fmtDay(token.launchedAt) : null },
                {
                  label: 'Project',
                  value: project ? <ProjectLink project={project} size={18} /> : null,
                  source: (
                    <Sources
                      evidence={token.evidence.filter((e) => e.field === 'projectId')}
                      align="end"
                    />
                  ),
                },
              ]}
            />
          </AsideCard>
        }
      />
    </div>
  );
}
