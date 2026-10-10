import { formatCompactUsd } from '@marketroom/core';
import {
  findOrganizationId,
  findPersonId,
  forField,
  loadInvestorProfile,
  type InvestorProfile,
} from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { AreaSpark, HBarChart, PieChart } from '@/components/charts/Charts';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { colorFor, dataColor } from '@/components/charts/palette';
import {
  EntityCard,
  PartyChip,
  PersonCard,
  projectHref,
  ProjectLink,
  roundHref,
} from '@/components/research/Entities';
import { ReviewBadge, Sources } from '@/components/research/Evidence';
import { ago, fmtDay, fmtMonth, isoOf } from '@/components/research/format';
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
import { Avatar } from '@/components/sol/Avatar';
import { WatchButton } from '@/components/sol/Watchlist';
import { Empty } from '@/components/sol/primitives';
import { currentEditor } from '@/lib/admin';
import { hrefWith, one, type Params } from '@/lib/query';
import { researchDb } from '@/lib/research';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Params> };

async function load(slug: string): Promise<InvestorProfile> {
  const db = await researchDb();
  const decoded = decodeURIComponent(slug);
  const found = await findOrganizationId(db, decoded);
  if (found.kind === 'redirect') permanentRedirect(`/investors/${found.slug}`);
  if (found.kind === 'missing') {
    // Angels are people: their investor page is their profile.
    const person = await findPersonId(db, decoded);
    if (person.kind !== 'missing')
      permanentRedirect(`/people/${person.kind === 'redirect' ? person.slug : decoded}`);
    notFound();
  }
  const profile = await loadInvestorProfile(db, found.value);
  if (!profile) notFound();
  return profile;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const { org, stats } = await load(slug);
    return {
      title: org.name,
      description:
        org.description?.slice(0, 180) ??
        `${org.name}: ${stats.deals} Solana deals across ${stats.portfolio} projects.`,
    };
  } catch {
    return { title: 'Investor' };
  }
}

const KIND: Record<string, string> = {
  vc: 'Venture capital',
  angel_group: 'Angel group',
  accelerator: 'Accelerator',
  exchange: 'Exchange',
  foundation: 'Foundation',
  dao: 'DAO',
  corporate: 'Corporate',
  company: 'Company',
  other: 'Other',
};

export default async function InvestorPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const [profile, editor] = await Promise.all([load(slug), currentEditor()]);
  const { org, stats, portfolio, deals, team, coInvestors, categories, roundTypes, byYear, news } =
    profile;
  const category = one(query.cat);
  const shownPortfolio = category
    ? portfolio.filter((p) => p.project.category === category)
    : portfolio;
  const base = `/investors/${org.slug}`;

  // Round sizes, lead or not, in buckets a reader recognises.
  const BUCKETS = [
    { label: 'Under $1M', max: 1e6 },
    { label: '$1M–5M', max: 5e6 },
    { label: '$5M–10M', max: 1e7 },
    { label: '$10M–25M', max: 2.5e7 },
    { label: '$25M–50M', max: 5e7 },
    { label: '$50M+', max: Infinity },
  ];
  const sizeRows = [
    ...BUCKETS.map((b, i) => {
      const inBucket = deals.filter(
        (d) =>
          d.round.amountUsd !== null &&
          d.round.amountUsd < b.max &&
          d.round.amountUsd >= (BUCKETS[i - 1]?.max ?? 0),
      );
      return {
        label: b.label,
        segments: [
          { key: 'lead', value: inBucket.filter((d) => d.isLead).length },
          { key: 'joined', value: inBucket.filter((d) => !d.isLead).length },
        ],
      };
    }),
    {
      label: 'Undisclosed',
      segments: [
        { key: 'lead', value: deals.filter((d) => d.round.amountUsd === null && d.isLead).length },
        {
          key: 'joined',
          value: deals.filter((d) => d.round.amountUsd === null && !d.isLead).length,
        },
      ],
    },
  ].filter((r) => r.segments.some((x) => x.value > 0));

  const years = byYear.map((y) => y.year).sort();
  const perYear = (lead: boolean) =>
    years.map(
      (y) => deals.filter((d) => d.round.announcedOn.startsWith(y) && d.isLead === lead).length,
    );

  const now = Date.now();
  const monthKeys = Array.from({ length: 24 }, (_, i) =>
    new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() - 23 + i, 1))
      .toISOString()
      .slice(0, 7),
  );
  const perMonth = monthKeys.map(
    (m) => deals.filter((d) => d.round.announcedOn.startsWith(m)).length,
  );
  const disclosedSizes = deals
    .map((d) => d.round.amountUsd)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const median = disclosedSizes.length
    ? disclosedSizes.length % 2
      ? disclosedSizes[(disclosedSizes.length - 1) / 2]!
      : (disclosedSizes[disclosedSizes.length / 2 - 1]! +
          disclosedSizes[disclosedSizes.length / 2]!) /
        2
    : null;
  const topPartners = coInvestors.slice(0, 12);
  const maxTogether = Math.max(1, ...topPartners.map((c) => c.together));

  const groups: NavGroup[] = [
    {
      label: 'Overview',
      items: [
        ...(org.description ? [{ id: 'about', label: 'About' }] : []),
        { id: 'focus', label: 'Investment map' },
      ],
    },
    {
      label: 'Investments',
      items: [
        { id: 'portfolio', label: 'Portfolio', count: portfolio.length },
        { id: 'rounds', label: 'Funding rounds', count: deals.length },
      ],
    },
    {
      label: 'Network',
      items: [
        { id: 'coinvestors', label: 'Co-investors', count: coInvestors.length },
        { id: 'team', label: 'Team', count: team.length },
      ],
    },
    { label: 'Coverage', items: [{ id: 'news', label: 'News', count: news.length }] },
  ];

  return (
    <div className="mr-container is-wide rx-profile-page">
      <Breadcrumbs items={[{ label: 'Investors', href: '/investors' }, { label: org.name }]} />

      <ProfileHero
        image={org.logoUrl}
        name={org.name}
        badges={
          <>
            {org.kind && <span className="rx-status is-kind">{KIND[org.kind] ?? org.kind}</span>}
            <ReviewBadge
              status={org.reviewStatus}
              checkedAt={org.checkedAt}
              checkedBy={org.checkedBy}
            />
          </>
        }
        subtitle={org.description ? org.description.split(/(?<=\.)\s/)[0] : null}
        tags={
          <>
            {org.location && <span className="rx-tag">{org.location}</span>}
            {org.foundedYear && <span className="rx-tag">Founded {org.foundedYear}</span>}
            {categories.slice(0, 3).map((c) => (
              <span key={c.category} className="rx-tag">
                {c.category}
              </span>
            ))}
          </>
        }
        links={<ExternalLinks website={org.website} twitter={org.twitter} />}
        actions={
          <>
            <WatchButton kind="investor" slug={org.slug} name={org.name} />
            {editor && (
              <Link
                className="rx-link is-editor"
                href={`/admin/edit/organization/${org.id}`}
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
              label="Solana deals"
              value={String(stats.deals)}
              sub={`${stats.last12m} in the last 12 months`}
            />
            <HeroStat
              label="Led"
              value={String(stats.leads)}
              sub={
                stats.deals ? `${Math.round((stats.leads / stats.deals) * 100)}% of deals` : null
              }
            />
            <HeroStat label="Portfolio" value={String(stats.portfolio)} sub="projects" />
            <HeroStat
              label="Rounds’ disclosed total"
              value={formatCompactUsd(stats.disclosedTotal)}
              sub="whole rounds, not its cheque"
            />
            <HeroStat
              label="Latest deal"
              value={stats.lastDeal ? fmtMonth(stats.lastDeal) : '—'}
              sub={stats.firstDeal ? `since ${stats.firstDeal.slice(0, 4)}` : null}
            />
          </>
        }
      />

      <ProfileTabs groups={groups} />

      <ProfileLayout
        nav={
          <ProfileRail
            groups={groups}
            head={
              <div className="rx-pnav-id">
                <Avatar src={org.logoUrl} name={org.name} size={30} shape="square" />
                <span className="rx-pnav-idtext">
                  <span className="rx-pnav-name">{org.name}</span>
                  <span className="rx-muted">
                    {stats.deals} deals · {stats.portfolio} projects
                  </span>
                </span>
              </div>
            }
          />
        }
        main={
          <>
            {org.description && (
              <Section id="about" title="About">
                <div className="rx-prose-block">
                  <p>{org.description}</p>
                  <span className="rx-inline-src">
                    <Sources evidence={forField(profile.evidence, 'description')} />
                  </span>
                </div>
              </Section>
            )}

            <Section id="focus" title="Investment map">
              {deals.length === 0 ? (
                <Empty>No deals on record yet.</Empty>
              ) : (
                <>
                  <div className="rx-charts-2">
                    <div>
                      <h3 className="rx-chart-title">Portfolio by category</h3>
                      <PieChart
                        slices={categories.map((c) => ({
                          label: c.category,
                          value: c.count,
                          href: `${hrefWith(base, query, { cat: c.category })}#portfolio`,
                        }))}
                        label={`${org.name} portfolio by category`}
                        size={210}
                        legendValue={(sl, share) => (
                          <>
                            {sl.value} · {Math.round(share * 100)}%
                          </>
                        )}
                      />
                    </div>
                    <div>
                      <h3 className="rx-chart-title">Round size, lead or not</h3>
                      <HBarChart
                        rows={sizeRows}
                        series={[
                          { key: 'lead', label: 'Led', color: dataColor(0) },
                          { key: 'joined', label: 'Participated', color: dataColor(2) },
                        ]}
                        label={`${org.name} deals by round size`}
                      />
                    </div>
                  </div>
                  <div className="rx-charts-2 rx-subsec">
                    {years.length > 1 && (
                      <div>
                        <h3 className="rx-chart-title">Deals per year</h3>
                        <ColumnChart
                          labels={years}
                          series={[
                            { key: 'lead', label: 'Led', values: perYear(true) },
                            { key: 'joined', label: 'Participated', values: perYear(false) },
                          ]}
                          format="count"
                          height={220}
                          label={`${org.name} deals per year, led and participated`}
                        />
                      </div>
                    )}
                    <div>
                      <h3 className="rx-chart-title">By round type</h3>
                      <PieChart
                        slices={roundTypes.map((r) => ({ label: r.roundType, value: r.count }))}
                        label={`${org.name} deals by round type`}
                        inner={0.62}
                        size={170}
                        center={{ value: String(deals.length), caption: 'deals' }}
                      />
                    </div>
                  </div>
                </>
              )}
            </Section>

            <Section
              id="portfolio"
              title="Portfolio"
              count={shownPortfolio.length}
              action={
                categories.length > 1 ? (
                  <nav className="rx-seg" aria-label="Filter portfolio by category">
                    <Link
                      href={`${base}#portfolio`}
                      aria-current={!category ? 'true' : undefined}
                      prefetch={false}
                    >
                      All
                    </Link>
                    {categories.slice(0, 6).map((c) => (
                      <Link
                        key={c.category}
                        href={`${hrefWith(base, query, { cat: c.category })}#portfolio`}
                        aria-current={category === c.category ? 'true' : undefined}
                        prefetch={false}
                      >
                        {c.category} <span className="rx-muted">{c.count}</span>
                      </Link>
                    ))}
                  </nav>
                ) : null
              }
            >
              {shownPortfolio.length === 0 ? (
                <Empty>No portfolio companies on record.</Empty>
              ) : (
                <ul className="rx-cards">
                  {shownPortfolio.map((p) => (
                    <EntityCard
                      key={p.project.id}
                      href={projectHref(p.project.slug)}
                      name={p.project.name}
                      imageUrl={p.project.logoUrl}
                      sub={
                        <>
                          {p.led && <span className="rx-chip-tag">Led</span>}{' '}
                          {p.project.category && (
                            <span
                              className="rx-tag-dot"
                              style={{ background: colorFor(p.project.category) }}
                              aria-hidden="true"
                            />
                          )}
                          {p.project.category ?? 'Project'}
                        </>
                      }
                    >
                      <span className="rx-card-meta">
                        {p.deals.map((d) => (
                          <Link
                            key={d.linkId}
                            href={roundHref(d.round.slug)}
                            className="rx-mini-link"
                            prefetch={false}
                          >
                            {d.round.roundType ?? 'Round'} {d.round.announcedOn.slice(0, 4)}
                          </Link>
                        ))}
                      </span>
                    </EntityCard>
                  ))}
                </ul>
              )}
            </Section>

            <Section
              id="rounds"
              title="Funding rounds"
              count={deals.length}
              lead="Every round this investor is named in, with the source that names it."
            >
              {deals.length === 0 ? (
                <Empty>No rounds on record.</Empty>
              ) : (
                <div className="rx-table-wrap">
                  <table className="rx-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Project</th>
                        <th>Round</th>
                        <th className="is-num">Round size</th>
                        <th>Role</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deals.map((d) => (
                        <tr key={d.linkId}>
                          <td className="mr-num">{fmtDay(d.round.announcedOn)}</td>
                          <td>
                            <ProjectLink project={d.project} />
                          </td>
                          <td>
                            <Link
                              href={roundHref(d.round.slug)}
                              className="rx-strong-link"
                              prefetch={false}
                            >
                              {d.round.roundType ?? 'Round'}
                            </Link>
                          </td>
                          <td className="is-num">
                            {d.round.amountUsd ? (
                              formatCompactUsd(d.round.amountUsd)
                            ) : (
                              <span className="rx-muted">Undisclosed</span>
                            )}
                          </td>
                          <td>
                            {d.isLead ? (
                              <span className="rx-chip-tag">Lead</span>
                            ) : (
                              <span className="rx-muted">Participant</span>
                            )}
                          </td>
                          <td>
                            <Sources evidence={d.evidence} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            <Section
              id="coinvestors"
              title="Co-investors"
              count={coInvestors.length}
              lead={
                coInvestors.length
                  ? 'Who else joined the same rounds, by number of rounds shared.'
                  : undefined
              }
            >
              {coInvestors.length === 0 ? (
                <Empty>No co-investors on record.</Empty>
              ) : (
                <>
                  <ol className="rx-activeinv is-wide">
                    {topPartners.map((c, n) => (
                      <li key={`${c.party.type}:${c.party.id}`}>
                        <span className="rx-rank-n mr-num">{n + 1}</span>
                        <PartyChip party={c.party} />
                        <span className="rx-activeinv-bar" aria-hidden="true">
                          <span
                            style={{
                              width: `${(c.together / maxTogether) * 100}%`,
                              background: dataColor(n),
                            }}
                          />
                        </span>
                        <span className="mr-num">
                          {c.together}{' '}
                          <span className="rx-muted">{c.together === 1 ? 'round' : 'rounds'}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                  {coInvestors.length > topPartners.length && (
                    <details className="rx-subsec rx-disclose">
                      <summary className="rx-subsec-title">
                        {coInvestors.length - topPartners.length} more co-investors
                      </summary>
                      <ul className="rx-coinv">
                        {coInvestors.slice(topPartners.length).map((c) => (
                          <li key={`${c.party.type}:${c.party.id}`}>
                            <PartyChip party={c.party} />
                            <span className="mr-num rx-muted">
                              {c.together} {c.together === 1 ? 'round' : 'rounds'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}
            </Section>

            <Section
              id="team"
              title="Team"
              count={team.length}
              lead={
                team.length
                  ? undefined
                  : 'No team members on record yet. Editors add partners and staff with the source that names them.'
              }
            >
              {team.length > 0 && (
                <ul className="rx-cards">
                  {team.map((t) => (
                    <PersonCard
                      key={t.linkId}
                      person={t.person}
                      role={t.role}
                      former={!t.isCurrent}
                    >
                      <span className="rx-card-meta">
                        <ReviewBadge status={t.reviewStatus} compact />
                        <Sources evidence={t.evidence} />
                      </span>
                    </PersonCard>
                  ))}
                </ul>
              )}
            </Section>

            <Section id="news" title="News" count={news.length}>
              {news.length === 0 ? (
                <Empty>No news mentions yet.</Empty>
              ) : (
                <ul className="rx-feed">
                  {news.map((n) => (
                    <li key={n.id}>
                      <time dateTime={isoOf(n.publishedAt)}>{fmtDay(n.publishedAt)}</time>
                      <div>
                        <a
                          href={n.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rx-feed-title"
                        >
                          {n.title}
                        </a>
                        <span className="rx-feed-meta">{n.publisher}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        }
        aside={
          <>
            <AsideCard title="Investment overview">
              <dl className="rx-stat-grid">
                <div>
                  <dt>Deals</dt>
                  <dd className="mr-num">{stats.deals}</dd>
                </div>
                <div>
                  <dt>Lead rate</dt>
                  <dd className="mr-num">
                    {stats.deals ? `${Math.round((stats.leads / stats.deals) * 100)}%` : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Median round</dt>
                  <dd className="mr-num">{formatCompactUsd(median)}</dd>
                </div>
                <div>
                  <dt>Last 12 months</dt>
                  <dd className="mr-num">{stats.last12m}</dd>
                </div>
              </dl>
              {perMonth.some((v) => v > 0) && (
                <div className="rx-tokenbox-spark">
                  <AreaSpark
                    values={perMonth}
                    width={272}
                    height={50}
                    tone="accent"
                    label={`${org.name} deals per month, last 24 months`}
                  />
                  <p className="rx-footnote">Deals per month, last 24 months.</p>
                </div>
              )}
              {coInvestors[0] && (
                <p className="rx-aside-text">
                  Most often alongside <PartyChip party={coInvestors[0].party} /> —{' '}
                  {coInvestors[0].together} {coInvestors[0].together === 1 ? 'round' : 'rounds'}.
                </p>
              )}
            </AsideCard>

            <AsideCard title="Profile">
              <Facts
                items={[
                  { label: 'Type', value: org.kind ? KIND[org.kind] : 'Not classified yet' },
                  { label: 'Location', value: org.location },
                  { label: 'Founded', value: org.foundedYear },
                  {
                    label: 'Website',
                    value: org.website ? (
                      <a
                        className="rx-clear"
                        href={org.website}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {org.website.replace(/^https?:\/\/(www\.)?/, '')}
                      </a>
                    ) : null,
                  },
                ]}
              />
              <div className="rx-check">
                <ReviewBadge
                  status={org.reviewStatus}
                  checkedAt={org.checkedAt}
                  checkedBy={org.checkedBy}
                />
                <Sources evidence={profile.evidence} label="Profile sources" />
              </div>
            </AsideCard>
            <AsideCard title="Follow">
              <p className="rx-aside-text">
                Watch to see this investor’s new rounds as they are added.
              </p>
              <div className="rx-aside-actions">
                <WatchButton kind="investor" slug={org.slug} name={org.name} />
                <a className="rx-link" href={`/updates/feed.xml?watch=organization:${org.slug}`}>
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
                        {c.actor.startsWith('import:') ? 'import' : c.actor} · {ago(c.at)}
                      </span>
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
