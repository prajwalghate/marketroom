import { formatCompactUsd, formatCount, formatPrice } from '@marketroom/core';
import {
  findProjectId,
  forField,
  loadProjectProfile,
  type ProjectProfile,
  type TokenLink,
} from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';
import { AreaSpark, PieChart, SplitBar } from '@/components/charts/Charts';
import { colorFor, dataColor } from '@/components/charts/palette';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { CopyAddress } from '@/components/CopyAddress';
import {
  EntityCard,
  partyHref,
  PartyChips,
  PersonCard,
  programHref,
  ProjectLink,
  roundHref,
  tokenHref,
} from '@/components/research/Entities';
import {
  Callout,
  Estimate,
  ReviewBadge,
  Sources,
  sourceKindLabel,
  Stamp,
  methodLabel,
} from '@/components/research/Evidence';
import {
  ago,
  fmtDay,
  fmtMonth,
  fmtRate,
  fmtStamp,
  isoOf,
  shortAddress,
} from '@/components/research/format';
import {
  AsideCard,
  Breadcrumbs,
  ExternalLinks,
  Facts,
  HeroStat,
  ProfileHero,
  ProfileLayout,
  Section,
} from '@/components/research/Profile';
import { ProfileRail, ProfileTabs, type NavGroup } from '@/components/research/ProfileNav';
import { Timeline } from '@/components/research/Timeline';
import { Avatar } from '@/components/sol/Avatar';
import { WatchButton } from '@/components/sol/Watchlist';
import { Delta, Empty, Tag } from '@/components/sol/primitives';
import { currentEditor } from '@/lib/admin';
import { researchDb } from '@/lib/research';
import { getProjectDetail, getTokenPriceHistory } from '@/lib/solana';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string): Promise<ProjectProfile> {
  const db = await researchDb();
  const found = await findProjectId(db, decodeURIComponent(slug));
  if (found.kind === 'redirect') permanentRedirect(`/projects/${found.slug}`);
  if (found.kind === 'missing') notFound();
  const profile = await loadProjectProfile(db, found.value);
  if (!profile) notFound();
  return profile;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const { project, tokens } = await load(slug);
    const symbol = tokens.find((t) => t.isPrimary)?.symbol;
    return {
      title: `${project.name}${symbol ? ` (${symbol})` : ''}`,
      description:
        project.tagline ?? project.description?.slice(0, 180) ?? `${project.name} on Solana.`,
    };
  } catch {
    return { title: 'Project' };
  }
}

const STATUS: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  acquired: 'Acquired',
  closed: 'Closed',
  pre_launch: 'Pre-launch',
};

const isContributor = (role: string) => /contributor/i.test(role);

export default async function ProjectPage({ params }: Props) {
  const { slug } = await params;
  const [profile, editor] = await Promise.all([load(slug), currentEditor()]);
  const { project, rounds, investors, team, programs, tokens, metrics, news, events, sources } =
    profile;

  const disclosed = rounds.filter((r) => r.amountUsd !== null);
  const raised = disclosed.length ? disclosed.reduce((s, r) => s + r.amountUsd!, 0) : null;
  const latest = rounds[0] ?? null;
  const primary = tokens.find((t) => t.isPrimary) ?? tokens[0] ?? null;
  const operated = programs.filter((p) => p.relation === 'operates');
  const measured = operated.filter((p) => p.activity && p.activity.txPerHour !== null);
  const txPerHour = measured.length
    ? measured.reduce((s, p) => s + (p.activity!.txPerHour ?? 0), 0)
    : null;
  const activityAt = measured.length
    ? Math.max(...measured.map((p) => p.activity!.capturedAt))
    : null;
  const people = team.filter((t) => !isContributor(t.role));
  const current = people.filter((t) => t.isCurrent);
  const former = people.filter((t) => !t.isCurrent);
  const contributors = team.filter((t) => isContributor(t.role));
  const unconfirmed =
    team.filter((t) => t.reviewStatus !== 'verified').length +
    programs.filter((p) => p.reviewStatus === 'needs_review').length;
  const lastImport = Math.max(
    0,
    ...profile.evidence.filter((e) => e.method === 'imported').map((e) => e.checkedAt),
  );
  const products = metrics?.products.filter((p) => (p.tvl ?? 0) > 0) ?? [];

  const groups: NavGroup[] = [
    { label: 'Overview', items: [{ id: 'overview', label: 'About' }] },
    {
      label: 'Market',
      items: [
        ...(primary ? [{ id: 'price', label: 'Price' }] : []),
        ...(project.defillamaKey ? [{ id: 'tvl', label: 'Value locked' }] : []),
        { id: 'tokens', label: 'Tokens', count: tokens.length },
      ],
    },
    {
      label: 'Essentials',
      items: [
        { id: 'team', label: 'Team', count: team.length },
        { id: 'events', label: 'Events', count: events.length },
      ],
    },
    {
      label: 'Financials',
      items: [
        { id: 'funding', label: 'Funding', count: rounds.length },
        { id: 'investors', label: 'Investors', count: investors.length },
      ],
    },
    { label: 'On-chain', items: [{ id: 'programs', label: 'Programs', count: programs.length }] },
    {
      label: 'Coverage',
      items: [
        { id: 'news', label: 'News', count: news.length },
        { id: 'sources', label: 'Sources', count: sources.length },
      ],
    },
  ];

  const railHead = (
    <div className="rx-pnav-id">
      <Avatar src={project.logoUrl} name={project.name} size={30} shape="square" />
      <span className="rx-pnav-idtext">
        <span className="rx-pnav-name">{project.name}</span>
        {primary?.market?.price != null ? (
          <span className="rx-pnav-price mr-num">
            {primary.symbol && <span className="rx-muted">{primary.symbol} </span>}
            {formatPrice(primary.market.price)} <Delta value={primary.market.change24h} />
          </span>
        ) : (
          project.category && <span className="rx-muted">{project.category}</span>
        )}
      </span>
    </div>
  );

  return (
    <div className="mr-container is-wide rx-profile-page">
      <Breadcrumbs
        items={[
          { label: 'Projects', href: '/projects' },
          ...(profile.parent
            ? [{ label: profile.parent.name, href: `/projects/${profile.parent.slug}` }]
            : []),
          { label: project.name },
        ]}
      />

      <ProfileHero
        image={project.logoUrl}
        name={project.name}
        extra={
          primary?.symbol ? <span className="rx-hero-symbol mr-num">{primary.symbol}</span> : null
        }
        badges={
          <>
            {project.status && (
              <span className={`rx-status is-${project.status}`}>{STATUS[project.status]}</span>
            )}
            <ReviewBadge
              status={project.reviewStatus}
              checkedAt={project.checkedAt}
              checkedBy={project.checkedBy}
            />
          </>
        }
        subtitle={project.tagline}
        tags={
          <>
            {project.category && (
              <Tag href={`/projects?category=${encodeURIComponent(project.category)}`}>
                <span
                  className="rx-tag-dot"
                  style={{ background: colorFor(project.category) }}
                  aria-hidden="true"
                />
                {project.category}
              </Tag>
            )}
            {project.tags
              .filter((t) => t !== project.category)
              .slice(0, 5)
              .map((t) => (
                <Tag key={t} href={`/projects?category=${encodeURIComponent(t)}`}>
                  {t}
                </Tag>
              ))}
          </>
        }
        links={
          <ExternalLinks
            website={project.website}
            twitter={project.twitter}
            github={project.githubOrgs}
            docs={project.docs}
            discord={project.discord}
            telegram={project.telegram}
          />
        }
        actions={
          <>
            <WatchButton kind="project" slug={project.slug} name={project.name} />
            <Link className="rx-link" href={`/compare?p=${project.slug}`} prefetch={false}>
              Compare
            </Link>
            {editor && (
              <Link
                className="rx-link is-editor"
                href={`/admin/edit/project/${project.id}`}
                prefetch={false}
              >
                Edit profile
              </Link>
            )}
          </>
        }
        stats={
          <>
            <HeroStat
              label="Total raised"
              value={
                raised !== null ? formatCompactUsd(raised) : rounds.length ? 'Undisclosed' : '—'
              }
              sub={
                rounds.length
                  ? `${rounds.length} round${rounds.length === 1 ? '' : 's'} · ${investors.length} investors`
                  : 'No funding on record'
              }
            />
            <HeroStat
              label="Latest round"
              value={
                latest
                  ? `${latest.roundType ?? 'Round'}${latest.amountUsd ? ` · ${formatCompactUsd(latest.amountUsd)}` : ''}`
                  : '—'
              }
              sub={latest ? fmtMonth(latest.announcedOn) : null}
            />
            <HeroStat
              label="Value locked"
              value={formatCompactUsd(metrics?.tvlSolana ?? null)}
              sub={
                metrics ? (
                  <Stamp provider={metrics.provider} at={metrics.capturedAt} />
                ) : (
                  'Not tracked'
                )
              }
            />
            <HeroStat
              label={primary?.symbol ? `${primary.symbol} price` : 'Token'}
              value={
                primary?.market ? formatPrice(primary.market.price) : primary ? '—' : 'No token'
              }
              sub={
                primary?.market ? (
                  <>
                    <Delta value={primary.market.change24h} /> ·{' '}
                    <Stamp
                      provider={primary.market.provider}
                      at={primary.market.capturedAt}
                      providerAt={primary.market.providerUpdatedAt}
                    />
                  </>
                ) : null
              }
            />
            <HeroStat
              label="Solana activity"
              value={
                txPerHour !== null ? (
                  <Estimate method="Summed across the project’s mapped programs, from their latest transaction signatures on a public RPC node.">
                    {fmtRate(txPerHour)}
                  </Estimate>
                ) : operated.length ? (
                  'Not measured yet'
                ) : (
                  '—'
                )
              }
              sub={
                activityAt
                  ? `${operated.length} program${operated.length === 1 ? '' : 's'} · ${ago(activityAt)}`
                  : operated.length
                    ? null
                    : 'No programs mapped'
              }
            />
          </>
        }
      />

      <ProfileTabs groups={groups} />

      <ProfileLayout
        nav={<ProfileRail groups={groups} head={railHead} />}
        main={
          <>
            <Section id="overview" title="About">
              {project.description ? (
                <div className="rx-prose-block">
                  <p>{project.description}</p>
                  <span className="rx-inline-src">
                    <Sources evidence={forField(profile.evidence, 'description')} />
                  </span>
                </div>
              ) : (
                <Empty>No description on record.</Empty>
              )}
              {products.length > 1 && (
                <div className="rx-subsec">
                  <h3 className="rx-subsec-title">Products by value locked</h3>
                  <PieChart
                    slices={products.map((p) => ({ label: p.name, value: p.tvl! }))}
                    label={`${project.name} value locked by product`}
                    inner={0.62}
                    size={190}
                    format={(v) => formatCompactUsd(v)}
                    center={{
                      value: formatCompactUsd(products.reduce((s, p) => s + p.tvl!, 0)),
                      caption: 'value locked',
                    }}
                  />
                  {metrics && (
                    <p className="rx-footnote">
                      <Stamp provider={metrics.provider} at={metrics.capturedAt} />
                    </p>
                  )}
                </div>
              )}
            </Section>

            {primary && (
              <Section
                id="price"
                title={`${primary.symbol ?? 'Token'} price`}
                action={
                  <Link href={tokenHref(primary.mint)} className="rx-more" prefetch={false}>
                    Token profile
                  </Link>
                }
              >
                <Suspense fallback={<div className="rx-chart-skeleton" aria-hidden="true" />}>
                  <PriceChart mint={primary.mint} symbol={primary.symbol ?? 'Token'} />
                </Suspense>
              </Section>
            )}

            {project.defillamaKey && (
              <Section id="tvl" title="Value locked on Solana">
                <Suspense fallback={<div className="rx-chart-skeleton" aria-hidden="true" />}>
                  <TvlHistory llamaKey={project.defillamaKey} name={project.name} />
                </Suspense>
                {metrics && (
                  <dl className="rx-perf">
                    <div>
                      <dt>Now</dt>
                      <dd className="mr-num">{formatCompactUsd(metrics.tvlSolana)}</dd>
                    </div>
                    <div>
                      <dt>24h</dt>
                      <dd>
                        <Delta value={metrics.tvlChange1d} />
                      </dd>
                    </div>
                    <div>
                      <dt>7 days</dt>
                      <dd>
                        <Delta value={metrics.tvlChange7d} />
                      </dd>
                    </div>
                    <div>
                      <dt>All chains</dt>
                      <dd className="mr-num">{formatCompactUsd(metrics.tvlTotal)}</dd>
                    </div>
                    <div>
                      <dt>Fees, 30d</dt>
                      <dd className="mr-num">{formatCompactUsd(metrics.fees30d)}</dd>
                    </div>
                    <div>
                      <dt>Revenue, 30d</dt>
                      <dd className="mr-num">{formatCompactUsd(metrics.revenue30d)}</dd>
                    </div>
                  </dl>
                )}
              </Section>
            )}

            <Section id="tokens" title="Tokens" count={tokens.length}>
              {tokens.length === 0 ? (
                <Empty>No token mapped to this project.</Empty>
              ) : (
                <div className="rx-table-wrap">
                  <table className="rx-table">
                    <thead>
                      <tr>
                        <th>Token</th>
                        <th className="is-num">Price</th>
                        <th className="is-num">24h</th>
                        <th className="is-num">Market cap</th>
                        <th className="is-num">FDV</th>
                        <th className="is-num">Volume 24h</th>
                        <th className="is-num">Liquidity</th>
                        <th className="is-num">Holders</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tokens.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <span className="rx-cell-entity">
                              <Avatar src={t.logoUrl} name={t.symbol ?? t.mint} size={24} />
                              <span>
                                <Link
                                  href={tokenHref(t.mint)}
                                  className="rx-strong-link"
                                  prefetch={false}
                                >
                                  {t.symbol ?? shortAddress(t.mint)}
                                </Link>
                                <span className="rx-under">
                                  {t.name ?? shortAddress(t.mint)}
                                  {t.standard === 'token-2022' ? ' · Token-2022' : ''}
                                  {t.isPrimary && tokens.length > 1 ? ' · main token' : ''}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td className="is-num">{formatPrice(t.market?.price ?? null)}</td>
                          <td className="is-num">
                            <Delta value={t.market?.change24h} />
                          </td>
                          <td className="is-num">
                            {formatCompactUsd(t.market?.marketCap ?? null)}
                          </td>
                          <td className="is-num">{formatCompactUsd(t.market?.fdv ?? null)}</td>
                          <td className="is-num">
                            {formatCompactUsd(t.market?.volume24h ?? null)}
                          </td>
                          <td className="is-num">
                            {formatCompactUsd(t.market?.liquidity ?? null)}
                          </td>
                          <td className="is-num">{formatCount(t.market?.holders ?? null)}</td>
                          <td>
                            <Sources evidence={t.evidence} align="end" />
                            {t.market && (
                              <span className="rx-under">
                                {t.market.provider} · {ago(t.market.capturedAt)}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            <Section
              id="team"
              title="Team"
              count={team.length}
              lead={
                people.length
                  ? undefined
                  : 'No founders or executives on record yet. Editors add them with the source that names them — a team page, an announcement, a filing.'
              }
            >
              {current.length > 0 && (
                <>
                  {former.length > 0 && (
                    <h3 className="rx-subsec-title">
                      Current <span className="rx-muted">· {current.length}</span>
                    </h3>
                  )}
                  <ul className="rx-cards">
                    {current.map((t) => (
                      <TeamCard key={t.linkId} member={t} />
                    ))}
                  </ul>
                </>
              )}
              {former.length > 0 && (
                <div className="rx-subsec">
                  <h3 className="rx-subsec-title">
                    Former <span className="rx-muted">· {former.length}</span>
                  </h3>
                  <ul className="rx-cards">
                    {former.map((t) => (
                      <TeamCard key={t.linkId} member={t} />
                    ))}
                  </ul>
                </div>
              )}
              {contributors.length > 0 && (
                <details className="rx-subsec rx-disclose" open={people.length === 0}>
                  <summary className="rx-subsec-title">
                    Open-source contributors{' '}
                    <span className="rx-muted">· {contributors.length} from GitHub</span>
                  </summary>
                  <p className="rx-sec-lead">
                    People with the most commits to the project’s public repositories. Contributing
                    code is not the same as being employed by the project; roles here are what
                    GitHub shows, nothing more.
                  </p>
                  <ul className="rx-cards is-compact">
                    {contributors.map((t) => (
                      <PersonCard
                        key={t.linkId}
                        person={t.person}
                        role={t.evidence[0]?.note ?? t.role}
                      >
                        <span className="rx-card-meta">
                          <Sources evidence={t.evidence} />
                        </span>
                      </PersonCard>
                    ))}
                  </ul>
                </details>
              )}
            </Section>

            <Section id="events" title="Events" count={events.length}>
              {events.length === 0 ? (
                <Empty>No events on record.</Empty>
              ) : (
                <Timeline
                  label={`${project.name} events, oldest to newest`}
                  items={[...events]
                    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
                    .map((e) => ({
                      key: String(e.id),
                      date: e.startsOn,
                      dateLabel: fmtDay(e.startsOn),
                      tone: e.kind === 'incident' ? 'var(--mr-down)' : colorFor(e.kind),
                      title: e.url ? (
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rx-clear-strong"
                        >
                          {e.title}
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      ) : (
                        e.title
                      ),
                      sub: (
                        <>
                          <span className={`rx-kind is-${e.kind}`}>{eventKind(e.kind)}</span>
                          {e.amountUsd ? (
                            <span className="mr-num rx-down"> {formatCompactUsd(e.amountUsd)}</span>
                          ) : null}
                        </>
                      ),
                      foot: (
                        <>
                          {sourceName(e.evidence)}
                          {e.linkMatchedBy && e.linkReviewStatus !== 'verified'
                            ? ' · matched by name, unconfirmed'
                            : ''}
                        </>
                      ),
                    }))}
                />
              )}
            </Section>

            <Section id="funding" title="Funding" count={rounds.length}>
              <Callout>
                Rounds come only from announcements, press and funding databases, each linked below.
                A wallet sending SOL or tokens is never counted as funding.
              </Callout>
              {rounds.length === 0 ? (
                <Empty>No disclosed funding rounds.</Empty>
              ) : (
                <>
                  <dl className="rx-perf is-left">
                    <div>
                      <dt>Total disclosed</dt>
                      <dd className="mr-num">{raised !== null ? formatCompactUsd(raised) : '—'}</dd>
                    </div>
                    <div>
                      <dt>Rounds</dt>
                      <dd className="mr-num">{rounds.length}</dd>
                    </div>
                    <div>
                      <dt>Investors</dt>
                      <dd className="mr-num">{investors.length}</dd>
                    </div>
                    <div>
                      <dt>Leads</dt>
                      <dd className="mr-num">{investors.filter((i) => i.isLead).length}</dd>
                    </div>
                  </dl>
                  <Timeline
                    label={`${project.name} funding rounds, oldest to newest`}
                    items={[...rounds]
                      .sort((a, b) => a.announcedOn.localeCompare(b.announcedOn))
                      .map((r) => ({
                        key: String(r.id),
                        date: r.announcedOn,
                        dateLabel: fmtMonth(r.announcedOn),
                        tone: colorFor(r.roundType ?? 'Round'),
                        title: (
                          <Link
                            href={roundHref(r.slug)}
                            className="rx-clear-strong"
                            prefetch={false}
                          >
                            {r.roundType ?? 'Round'}
                          </Link>
                        ),
                        sub: (
                          <span className="mr-num">
                            {r.amountUsd ? formatCompactUsd(r.amountUsd) : 'Undisclosed'}
                            {r.valuationUsd ? (
                              <span className="rx-muted">
                                {' '}
                                · {formatCompactUsd(r.valuationUsd)} valuation
                              </span>
                            ) : null}
                          </span>
                        ),
                        foot: r.investors.length ? (
                          <span
                            className="rx-avatars"
                            title={r.investors.map((i) => i.party.name).join(', ')}
                          >
                            {r.investors.slice(0, 5).map((i) => (
                              <Avatar
                                key={`${i.party.type}:${i.party.id}`}
                                src={i.party.imageUrl}
                                name={i.party.name}
                                size={20}
                                shape={i.party.type === 'person' ? 'round' : 'square'}
                              />
                            ))}
                            <span className="rx-muted">
                              {r.investors.length} investor{r.investors.length === 1 ? '' : 's'}
                            </span>
                          </span>
                        ) : (
                          <span className="rx-muted">Investors not disclosed</span>
                        ),
                      }))}
                  />
                  <div className="rx-table-wrap">
                    <table className="rx-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Round</th>
                          <th className="is-num">Amount</th>
                          <th className="is-num">Valuation</th>
                          <th>Investors</th>
                          <th>Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rounds.map((r) => (
                          <tr key={r.id}>
                            <td className="mr-num">
                              <time dateTime={r.announcedOn}>{fmtDay(r.announcedOn)}</time>
                            </td>
                            <td>
                              <Link
                                href={roundHref(r.slug)}
                                className="rx-strong-link"
                                prefetch={false}
                              >
                                {r.roundType ?? 'Round'}
                              </Link>
                              <span className="rx-under">
                                <ReviewBadge
                                  status={r.reviewStatus}
                                  checkedAt={r.checkedAt}
                                  compact
                                />
                              </span>
                            </td>
                            <td className="is-num">
                              {r.amountUsd ? (
                                formatCompactUsd(r.amountUsd)
                              ) : (
                                <span className="rx-muted">Undisclosed</span>
                              )}
                            </td>
                            <td className="is-num">
                              {r.valuationUsd ? (
                                formatCompactUsd(r.valuationUsd)
                              ) : (
                                <span className="rx-muted">—</span>
                              )}
                            </td>
                            <td>
                              <PartyChips
                                parties={r.investors.map((i) => ({ ...i.party, isLead: i.isLead }))}
                                max={4}
                                moreHref={roundHref(r.slug)}
                              />
                            </td>
                            <td>
                              <Sources evidence={r.evidence} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Section>

            <Section
              id="investors"
              title="Investors"
              count={investors.length}
              lead={
                investors.length ? 'Everyone named in a disclosed round, leads first.' : undefined
              }
            >
              {investors.length === 0 ? (
                <Empty>No investors on record.</Empty>
              ) : (
                <>
                  <SplitBar
                    label="Investors by type"
                    parts={investorMix(investors).map((m, i) => ({
                      label: m.label,
                      value: m.count,
                      color: dataColor(i),
                    }))}
                  />
                  <ul className="rx-cards">
                    {investors.map((i) => (
                      <EntityCard
                        key={`${i.party.type}:${i.party.id}`}
                        href={partyHref(i.party)}
                        name={i.party.name}
                        imageUrl={i.party.imageUrl}
                        shape={i.party.type === 'person' ? 'round' : 'square'}
                        sub={
                          <>
                            {i.isLead && <span className="rx-chip-tag">Lead</span>}{' '}
                            {i.party.type === 'person' ? 'Angel investor' : orgKind(i.kind)}
                          </>
                        }
                      >
                        <span className="rx-card-meta">
                          {i.rounds.map((r) => (
                            <Link
                              key={r.slug}
                              href={roundHref(r.slug)}
                              prefetch={false}
                              className="rx-mini-link"
                            >
                              {r.roundType ?? 'Round'} {r.announcedOn.slice(0, 4)}
                            </Link>
                          ))}
                        </span>
                      </EntityCard>
                    ))}
                  </ul>
                </>
              )}
            </Section>

            <Section
              id="programs"
              title="Solana programs"
              count={programs.length}
              lead={
                programs.length
                  ? 'The on-chain programs this project operates or relies on. Mappings made automatically say so until an editor confirms them.'
                  : 'No programs mapped yet. Editors map them from the project’s docs, verified builds or explorers.'
              }
            >
              {programs.length > 0 && (
                <>
                  <div className="rx-table-wrap">
                    <table className="rx-table">
                      <thead>
                        <tr>
                          <th>Program</th>
                          <th>Upgradeable</th>
                          <th>Verified build</th>
                          <th className="is-num">Activity</th>
                          <th>Last 14 days</th>
                          <th>Mapping</th>
                        </tr>
                      </thead>
                      <tbody>
                        {programs.map((p) => (
                          <tr key={p.linkId}>
                            <td>
                              <Link
                                href={programHref(p.program.address)}
                                className="rx-strong-link"
                                prefetch={false}
                              >
                                {p.program.name ?? shortAddress(p.program.address)}
                              </Link>
                              <span className="rx-under mr-num">
                                {shortAddress(p.program.address)} ·{' '}
                                {p.relation === 'operates' ? 'operated' : 'used'}
                                {p.program.kind ? ` · ${p.program.kind}` : ''}
                              </span>
                            </td>
                            <td>
                              {p.program.loader === 'upgradeable' ? (
                                p.program.upgradeAuthority ? (
                                  <span title={`Upgrade authority ${p.program.upgradeAuthority}`}>
                                    Yes · {shortAddress(p.program.upgradeAuthority)}
                                  </span>
                                ) : (
                                  'No — authority revoked'
                                )
                              ) : p.program.loader === 'immutable' ? (
                                'No'
                              ) : (
                                <span className="rx-muted">Not read yet</span>
                              )}
                            </td>
                            <td>
                              {p.program.verifiedBuild ? (
                                <a
                                  href={p.program.verifiedRepo ?? '#'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rx-clear"
                                >
                                  Verified source
                                </a>
                              ) : p.program.verifiedBuild === false ? (
                                <span className="rx-muted">No longer matches</span>
                              ) : (
                                <span className="rx-muted">—</span>
                              )}
                            </td>
                            <td className="is-num">
                              {p.activity ? (
                                <>
                                  <Estimate method={p.activity.method}>
                                    {fmtRate(p.activity.txPerHour)}
                                  </Estimate>
                                  <span className="rx-sub-num">
                                    {p.activity.latestTxAt
                                      ? `last tx ${ago(p.activity.latestTxAt)}`
                                      : 'no recent tx'}
                                  </span>
                                </>
                              ) : (
                                <span className="rx-muted">Not measured yet</span>
                              )}
                            </td>
                            <td>
                              {p.history.length > 1 ? (
                                <AreaSpark
                                  values={thin(
                                    p.history.map((h) => h.v),
                                    84,
                                  )}
                                  width={120}
                                  height={32}
                                  tone="accent"
                                  label={`${p.program.name ?? 'Program'} estimated transactions per hour, last 14 days`}
                                />
                              ) : (
                                <span className="rx-muted">—</span>
                              )}
                            </td>
                            <td>
                              <ReviewBadge status={p.reviewStatus} compact />
                              <span className="rx-under">
                                <Sources evidence={p.evidence} />
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {measured[0]?.activity && (
                    <p className="rx-footnote">
                      Activity is estimated, not counted: {measured[0].activity.method} Measured by{' '}
                      {measured[0].activity.provider}, {fmtStamp(measured[0].activity.capturedAt)}.
                      Busy programs are not evidence of funding, revenue or users.
                    </p>
                  )}
                </>
              )}
            </Section>

            <Section id="news" title="News" count={news.length}>
              {news.length === 0 ? (
                <Empty>No news mentions yet.</Empty>
              ) : (
                <ul className="rx-newsgrid">
                  {news.map((n) => (
                    <li key={n.id}>
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rx-feed-title"
                      >
                        {n.title}
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                      {n.summary && <p className="rx-newsgrid-sum">{n.summary}</p>}
                      <span className="rx-feed-meta">
                        <span
                          className="rx-legend-dot"
                          style={{ background: colorFor(n.publisher) }}
                          aria-hidden="true"
                        />{' '}
                        {n.publisher} ·{' '}
                        <time dateTime={isoOf(n.publishedAt)}>{fmtDay(n.publishedAt)}</time>
                        {n.reviewStatus !== 'verified' &&
                          ` · matched by name in the ${n.matchedBy}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section
              id="sources"
              title="Sources"
              count={sources.length}
              lead="Every link this profile relies on, what it supports, how it was obtained and when it was last checked."
            >
              {sources.length === 0 ? (
                <Empty>No sources yet.</Empty>
              ) : (
                <div className="rx-table-wrap">
                  <table className="rx-table rx-sources">
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th>Type</th>
                        <th>Supports</th>
                        <th>Last checked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sources.map((s) => (
                        <tr key={s.source.sourceId}>
                          <td>
                            <a
                              href={s.source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rx-strong-link"
                            >
                              {s.source.publisher ?? s.source.title ?? s.source.url}
                            </a>
                            <span className="rx-under rx-url">{s.source.url}</span>
                          </td>
                          <td>
                            <span className={`rx-src-kind is-${s.source.kind}`}>
                              {sourceKindLabel(s.source.kind)}
                            </span>
                          </td>
                          <td>
                            <SupportsList items={s.supports} />
                          </td>
                          <td className="mr-num">
                            <time dateTime={isoOf(s.lastChecked)}>{fmtDay(s.lastChecked)}</time>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </>
        }
        aside={
          <>
            {primary && (
              <Suspense fallback={<TokenBox token={primary} />}>
                <TokenBoxLive token={primary} />
              </Suspense>
            )}

            <AsideCard title="Profile">
              <Facts
                items={[
                  {
                    label: 'Category',
                    value: project.category,
                    source: (
                      <Sources evidence={forField(profile.evidence, 'category')} align="end" />
                    ),
                  },
                  {
                    label: 'Status',
                    value: project.status ? STATUS[project.status] : 'Not assessed',
                    source: project.status ? (
                      <Sources evidence={forField(profile.evidence, 'status')} align="end" />
                    ) : null,
                  },
                  { label: 'Founded', value: project.foundedYear },
                  {
                    label: 'Part of',
                    value: profile.parent ? (
                      <ProjectLink project={profile.parent} size={18} />
                    ) : null,
                  },
                  {
                    label: 'Products',
                    value: profile.children.length ? (
                      <span className="rx-chips">
                        {profile.children.map((c) => (
                          <ProjectLink key={c.id} project={c} size={16} />
                        ))}
                      </span>
                    ) : null,
                  },
                  {
                    label: 'DefiLlama',
                    value: project.defillamaKey ? (
                      <a
                        className="rx-clear"
                        href={`https://defillama.com/protocol/${project.defillamaKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {project.defillamaKey}
                      </a>
                    ) : null,
                  },
                  {
                    label: 'CoinGecko',
                    value: project.coingeckoId ? (
                      <a
                        className="rx-clear"
                        href={`https://www.coingecko.com/en/coins/${project.coingeckoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {project.coingeckoId}
                      </a>
                    ) : null,
                  },
                ]}
              />
            </AsideCard>

            <AsideCard title="Data checks">
              <div className="rx-check">
                <ReviewBadge
                  status={project.reviewStatus}
                  checkedAt={project.checkedAt}
                  checkedBy={project.checkedBy}
                />
                <p>
                  {project.reviewStatus === 'verified'
                    ? `Checked against its sources by ${project.checkedBy ?? 'an editor'} on ${fmtDay(project.checkedAt)}.`
                    : 'Imported from the sources below; no editor has checked this profile yet.'}
                </p>
                <ul className="rx-check-list">
                  <li>
                    <strong>{sources.length}</strong> sources cited
                  </li>
                  {lastImport > 0 && (
                    <li>
                      Last refreshed from sources{' '}
                      <time dateTime={isoOf(lastImport)}>{ago(lastImport)}</time>
                    </li>
                  )}
                  {unconfirmed > 0 && (
                    <li>
                      <strong>{unconfirmed}</strong> automatic{' '}
                      {unconfirmed === 1 ? 'connection' : 'connections'} awaiting confirmation
                    </li>
                  )}
                </ul>
              </div>
            </AsideCard>

            <AsideCard title="Follow">
              <p className="rx-aside-text">
                Watch this project to see its new rounds, team changes, mappings and news in your
                updates.
              </p>
              <div className="rx-aside-actions">
                <WatchButton kind="project" slug={project.slug} name={project.name} />
                <a className="rx-link" href={`/updates/feed.xml?watch=project:${project.slug}`}>
                  RSS feed
                </a>
              </div>
            </AsideCard>

            {profile.changes.length > 0 && (
              <AsideCard title="Recent updates">
                <ul className="rx-changes">
                  {profile.changes.slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <span>{c.summary}</span>
                      <span className="rx-muted">
                        {c.actor.startsWith('import:') ? 'import' : c.actor} ·{' '}
                        <time dateTime={isoOf(c.at)}>{ago(c.at)}</time>
                      </span>
                    </li>
                  ))}
                </ul>
              </AsideCard>
            )}

            {profile.similar.length > 0 && (
              <AsideCard title={`More in ${project.category ?? 'this category'}`}>
                <ul className="rx-aside-list">
                  {profile.similar.map((s) => (
                    <li key={s.id}>
                      <ProjectLink project={s} size={22} sub={formatCompactUsd(s.tvlSolana)} />
                    </li>
                  ))}
                </ul>
              </AsideCard>
            )}
          </>
        }
      />
    </div>
  );
}

function TeamCard({ member: t }: { member: ProjectProfile['team'][number] }) {
  return (
    <PersonCard person={t.person} role={t.role} former={!t.isCurrent}>
      <span className="rx-card-meta">
        {(t.startedOn || t.endedOn) && (
          <span>
            {t.startedOn ? fmtMonth(t.startedOn) : '?'} –{' '}
            {t.isCurrent ? 'now' : t.endedOn ? fmtMonth(t.endedOn) : '?'}
          </span>
        )}
        <ReviewBadge status={t.reviewStatus} compact />
        <Sources evidence={t.evidence} />
      </span>
    </PersonCard>
  );
}

/** The publisher of the first source, for places too tight for the full list. */
function sourceName(evidence: readonly { publisher: string | null; kind: string }[]): string {
  const first = evidence[0];
  return first ? `Source: ${first.publisher ?? sourceKindLabel(first.kind)}` : 'No source yet';
}

/** At most `n` points, evenly spaced — a sparkline cannot show more. */
function thin(values: readonly number[], n: number): number[] {
  if (values.length <= n) return [...values];
  const step = values.length / n;
  return Array.from(
    { length: n },
    (_, i) => values[Math.min(values.length - 1, Math.round(i * step))]!,
  ).concat(values[values.length - 1]!);
}

function investorMix(investors: ProjectProfile['investors']) {
  const counts = new Map<string, number>();
  for (const i of investors) {
    const label = i.party.type === 'person' ? 'Angel investors' : orgKind(i.kind);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

const within = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([
    p.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);

const DAY = 86_400_000;

/** The price history, or why there is none: no pool listed, or the request failed. */
async function priceHistory(mint: string, ms: number) {
  return Promise.race([
    getTokenPriceHistory(mint).then(
      (history) => ({ ok: true as const, history }),
      () => ({ ok: false as const, history: null }),
    ),
    new Promise<{ ok: false; history: null }>((resolve) =>
      setTimeout(() => resolve({ ok: false, history: null }), ms),
    ),
  ]);
}

async function PriceChart({ mint, symbol }: { mint: string; symbol: string }) {
  const { ok, history } = await priceHistory(mint, 9_000);
  if (!history) {
    return (
      <Empty>
        {ok
          ? 'GeckoTerminal lists no Solana pool with daily prices for this token yet.'
          : 'GeckoTerminal did not answer in time. The price history is fetched again on the next visit.'}
      </Empty>
    );
  }
  const { candles, pool, fetchedAt } = history;
  const last = candles[candles.length - 1]!;
  const first = candles[0]!;
  const periods = [
    { label: '7 days', days: 7 },
    { label: '30 days', days: 30 },
    { label: '90 days', days: 90 },
    { label: '180 days', days: 180 },
    { label: '1 year', days: 365 },
  ]
    .filter((p) => last.t - first.t >= (p.days - 1) * DAY)
    .map((p) => {
      const base = candles.find((c) => c.t >= last.t - p.days * DAY);
      return { ...p, change: base && base.c > 0 ? last.c / base.c - 1 : null };
    });
  const high = Math.max(...candles.map((c) => c.h));
  const low = Math.min(...candles.map((c) => c.l));
  const spanDays = Math.round((last.t - first.t) / DAY) + 1;
  return (
    <>
      <TimeSeriesChart
        candles={candles.map(({ t, o, h, l, c }) => ({ t, o, h, l, c }))}
        kind="price"
        label={`${symbol} price, daily`}
        height={300}
        note={`Daily candles from GeckoTerminal for the ${pool.name} pool on ${pool.dex}, the deepest Solana pool it lists for ${symbol} (${formatCompactUsd(pool.reserveUsd)} in reserves). One pool’s trades, not an average across venues. Fetched ${ago(fetchedAt)}.`}
      />
      <dl className="rx-perf">
        {periods.map((p) => (
          <div key={p.label}>
            <dt>{p.label}</dt>
            <dd>
              <Delta value={p.change} />
            </dd>
          </div>
        ))}
        <div>
          <dt>{spanDays}-day range</dt>
          <dd className="mr-num">
            {formatPrice(low)} – {formatPrice(high)}
          </dd>
        </div>
      </dl>
    </>
  );
}

function TokenBox({ token, spark }: { token: TokenLink; spark?: readonly number[] }) {
  const m = token.market;
  const symbol = token.symbol ?? shortAddress(token.mint);
  return (
    <section className="rx-aside-card rx-tokenbox" aria-labelledby={`tok-${token.id}`}>
      <h2 className="rx-tokenbox-head" id={`tok-${token.id}`}>
        <Avatar src={token.logoUrl} name={symbol} size={26} />
        <Link href={tokenHref(token.mint)} className="rx-clear-strong" prefetch={false}>
          {symbol}
        </Link>
        {token.name && <span className="rx-muted">{token.name}</span>}
      </h2>
      {m ? (
        <>
          <p className="rx-tokenbox-price">
            <span className="mr-num">{formatPrice(m.price)}</span>
            <Delta value={m.change24h} />
            <span className="rx-muted">24h</span>
          </p>
          {spark && spark.length > 1 && (
            <div className="rx-tokenbox-spark">
              <AreaSpark
                values={spark}
                width={272}
                height={54}
                label={`${symbol} daily close, last 30 days`}
              />
            </div>
          )}
          <Facts
            items={[
              {
                label: 'Market cap',
                value: <span className="mr-num">{formatCompactUsd(m.marketCap)}</span>,
              },
              { label: 'FDV', value: <span className="mr-num">{formatCompactUsd(m.fdv)}</span> },
              {
                label: 'Volume 24h',
                value: <span className="mr-num">{formatCompactUsd(m.volume24h)}</span>,
              },
              {
                label: 'Liquidity',
                value: <span className="mr-num">{formatCompactUsd(m.liquidity)}</span>,
              },
              { label: 'Holders', value: <span className="mr-num">{formatCount(m.holders)}</span> },
              {
                label: 'Standard',
                value: token.standard === 'token-2022' ? 'Token-2022' : 'SPL token',
              },
              { label: 'Listed since', value: token.launchedAt ? fmtDay(token.launchedAt) : null },
              { label: 'Mint', value: <CopyAddress address={token.mint} /> },
            ]}
          />
          <p className="rx-footnote">
            From {m.provider}
            {m.providerUpdatedAt ? ` at ${fmtStamp(m.providerUpdatedAt)}` : ''}; fetched{' '}
            {ago(m.capturedAt)}.
            {spark && spark.length > 1 ? ' Chart: GeckoTerminal daily closes.' : ''}
          </p>
        </>
      ) : (
        <>
          <p className="rx-muted">No market data yet.</p>
          <Facts items={[{ label: 'Mint', value: <CopyAddress address={token.mint} /> }]} />
        </>
      )}
    </section>
  );
}

async function TokenBoxLive({ token }: { token: TokenLink }) {
  const { history } = await priceHistory(token.mint, 6_000);
  return <TokenBox token={token} spark={history?.candles.slice(-30).map((c) => c.c)} />;
}

function SupportsList({
  items,
}: {
  items: readonly { label: string; method: string; checkedAt: number; checkedBy: string }[];
}) {
  const shown = items.slice(0, 4);
  const rest = items.slice(4);
  const line = (s: (typeof items)[number]) => (
    <li key={s.label}>
      {s.label}{' '}
      <span className="rx-muted">
        · {methodLabel({ method: s.method as 'imported', checkedBy: s.checkedBy })}
      </span>
    </li>
  );
  return (
    <ul className="rx-supports">
      {shown.map(line)}
      {rest.length > 0 && (
        <li>
          <details>
            <summary>{rest.length} more</summary>
            <ul className="rx-supports">{rest.map(line)}</ul>
          </details>
        </li>
      )}
    </ul>
  );
}

async function TvlHistory({ llamaKey, name }: { llamaKey: string; name: string }) {
  const detail = await within(getProjectDetail(llamaKey), 8_000);
  const series = detail?.tvlSeries.slice(-1100) ?? [];
  if (series.length < 2) return <Empty>No value-locked history available.</Empty>;
  return (
    <TimeSeriesChart
      points={series}
      kind="usd"
      label={`${name} value locked on Solana`}
      note="Daily, from DefiLlama; fetched live and cached for an hour."
    />
  );
}

const ORG_KIND: Record<string, string> = {
  vc: 'Venture capital',
  angel_group: 'Angel group',
  accelerator: 'Accelerator',
  exchange: 'Exchange',
  foundation: 'Foundation',
  dao: 'DAO',
  corporate: 'Corporate investor',
  company: 'Company',
  other: 'Investor',
};
const orgKind = (k: string | null) => (k ? (ORG_KIND[k] ?? k) : 'Investor');

const EVENT_KIND: Record<string, string> = {
  launch: 'Launch',
  token_launch: 'Token launch',
  upgrade: 'Upgrade',
  milestone: 'Milestone',
  incident: 'Incident',
  governance: 'Governance',
  conference: 'Conference',
  hackathon: 'Hackathon',
  other: 'Event',
};
const eventKind = (k: string) => EVENT_KIND[k] ?? k;
