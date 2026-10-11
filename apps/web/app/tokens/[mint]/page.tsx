import {
  formatCompactUsd,
  formatCount,
  formatPercentAdaptive,
  formatPrice,
  type TokenMarket,
} from '@marketroom/core';
import { loadTokenProfile } from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
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
import { PriceChart } from '@/components/research/PriceHistory';
import { WatchButton } from '@/components/sol/Watchlist';
import { Delta, Empty } from '@/components/sol/primitives';
import { currentEditor } from '@/lib/admin';
import { researchDb } from '@/lib/research';
import { getLiveToken } from '@/lib/solana';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ mint: string }> };

/** The Token-2022 program; anything else Jupiter reports is the classic SPL program. */
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

/** A Solana mint: base58, 32 to 44 characters. Anything else is not looked up. */
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * A token the database has recorded, or one the site's market data holds —
 * a token on a trending list — with its live market from Jupiter, so every
 * token named on the site has a page. Any other address is not found.
 */
async function lookup(raw: string) {
  const mint = decodeURIComponent(raw);
  if (!MINT.test(mint)) return null;
  const profile = await loadTokenProfile(await researchDb(), mint).catch(() => null);
  if (profile) return { kind: 'recorded' as const, profile };
  const live = await getLiveToken(mint);
  return live?.mint ? { kind: 'live' as const, live } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { mint } = await params;
  const found = await lookup(mint);
  if (!found) return { title: 'Token' };
  if (found.kind === 'live')
    return {
      title: found.live.symbol || found.live.name || 'Token',
      description: `${found.live.name} on Solana: live price, market cap, volume, liquidity and holders from Jupiter.`,
    };
  const { token, project } = found.profile;
  return {
    title: `${token.symbol ?? 'Token'}${project ? ` · ${project.name}` : ''}`,
    description: `${token.name ?? token.symbol ?? 'Token'} on Solana: price, market cap, volume, liquidity and holders, with the provider and time of each.`,
  };
}

export default async function TokenPage({ params }: Props) {
  const { mint } = await params;
  const [found, editor] = await Promise.all([lookup(mint), currentEditor()]);
  if (!found) notFound();
  if (found.kind === 'live') return <LiveToken market={found.live} />;
  const { token, project, history } = found.profile;
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
            <Section id="price" title={`${token.symbol ?? 'Token'} price`}>
              <Suspense fallback={<div className="rx-chart-skeleton" aria-hidden="true" />}>
                <PriceChart mint={token.mint} symbol={token.symbol ?? 'Token'} />
              </Suspense>
              {priced.length >= 2 && (
                <div className="rx-subsec">
                  <h3 className="rx-subsec-title">Recorded snapshots</h3>
                  <TimeSeriesChart
                    points={priced}
                    kind="price"
                    height={200}
                    label={`${token.symbol ?? 'Token'} price, from this site’s snapshots`}
                    note="This site’s own snapshots of the provider’s figures: every 15 minutes for a week, then one a day."
                  />
                </div>
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

/** A token the database has not recorded: its live market, its price chart, and what it is. */
function LiveToken({ market: m }: { market: TokenMarket }) {
  const mint = m.mint!;
  const symbol = m.symbol || m.name || 'Token';
  const metrics: [string, React.ReactNode][] = [
    ['Price', formatPrice(m.price)],
    ['Change 1h', <Delta key="1h" value={m.change1h} />],
    ['Change 24h', <Delta key="24h" value={m.change24h} />],
    ['Market cap', formatCompactUsd(m.marketCap)],
    ['Fully diluted', formatCompactUsd(m.fdv)],
    ['Volume 24h', formatCompactUsd(m.volume24h)],
    ['Liquidity', formatCompactUsd(m.liquidity)],
    ['Holders', formatCount(m.holders)],
    ['Traders 24h', formatCount(m.traders24h)],
  ];
  return (
    <div className="mr-container">
      <Breadcrumbs items={[{ label: 'Tokens', href: '/tokens' }, { label: symbol }]} />
      <ProfileHero
        image={m.image}
        name={symbol}
        title={symbol}
        extra={m.name && m.name !== symbol ? <span className="rx-hero-dim">{m.name}</span> : null}
        badges={<span className="rx-status is-kind">Live data</span>}
        subtitle="Not in the database yet: no project is mapped to this token, and the figures below come live from Jupiter."
        links={
          <>
            <CopyAddress address={mint} />
            <a
              className="rx-pill"
              href={`https://solscan.io/token/${mint}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Solscan<span className="sr-only"> (opens in a new tab)</span>
            </a>
            <a
              className="rx-pill"
              href={`https://jup.ag/tokens/${mint}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Jupiter<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </>
        }
        actions={<WatchButton kind="token" slug={mint} name={symbol} />}
        stats={
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
              sub={m.updatedAt ? `Jupiter · ${ago(m.updatedAt)}` : 'Jupiter'}
            />
          </>
        }
      />
      <ProfileLayout
        main={
          <>
            <Section id="price" title={`${symbol} price`}>
              <Suspense fallback={<div className="rx-chart-skeleton" aria-hidden="true" />}>
                <PriceChart mint={mint} symbol={symbol} />
              </Suspense>
            </Section>
            <Section id="market" title="Market">
              <dl className="rx-metrics">
                {metrics.map(([label, value]) => (
                  <div key={label} className="rx-metric">
                    <dt>{label}</dt>
                    <dd>
                      <span className="mr-num">{value}</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="rx-footnote">
                As reported by Jupiter
                {m.updatedAt ? ` at ${fmtStamp(m.updatedAt)}` : ''}. Market cap, holders and the
                organic score are Jupiter’s figures, not ours
                {m.organicScore !== null
                  ? `; its organic score for this token is ${Math.round(m.organicScore)} of 100`
                  : ''}
                .
              </p>
            </Section>
          </>
        }
        aside={
          <AsideCard title="Token">
            <Facts
              items={[
                { label: 'Mint', value: <CopyAddress address={mint} /> },
                {
                  label: 'Standard',
                  value:
                    m.tokenProgram === TOKEN_2022
                      ? 'Token-2022'
                      : m.tokenProgram
                        ? 'SPL token'
                        : null,
                },
                { label: 'Decimals', value: m.decimals },
                { label: 'Created', value: m.createdAt ? fmtDay(m.createdAt) : null },
                {
                  label: 'Jupiter',
                  value: m.verified ? 'Verified' : m.verified === false ? 'Not verified' : null,
                },
                {
                  label: '7-day change',
                  value:
                    m.change7d !== null
                      ? formatPercentAdaptive(m.change7d, { signed: true })
                      : null,
                },
              ]}
            />
          </AsideCard>
        }
      />
    </div>
  );
}
