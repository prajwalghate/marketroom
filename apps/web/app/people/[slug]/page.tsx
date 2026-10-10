import { formatCompactUsd } from '@marketroom/core';
import {
  findPersonId,
  forField,
  loadPersonNetwork,
  loadPersonProfile,
  type PersonProfile,
} from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { PieChart } from '@/components/charts/Charts';
import { colorFor } from '@/components/charts/palette';
import { EntityCard, investorHref, projectHref, roundHref } from '@/components/research/Entities';
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
import { researchDb } from '@/lib/research';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string): Promise<PersonProfile> {
  const db = await researchDb();
  const found = await findPersonId(db, decodeURIComponent(slug));
  if (found.kind === 'redirect') permanentRedirect(`/people/${found.slug}`);
  if (found.kind === 'missing') notFound();
  const profile = await loadPersonProfile(db, found.value);
  if (!profile) notFound();
  return profile;
}

const REASON: Record<string, string> = {
  'co-invested': 'Invested in the same rounds',
  'same team': 'Same team',
  'same firm': 'Same firm',
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const { person, projects } = await load(slug);
    const role = projects.find((p) => p.isCurrent);
    return {
      title: person.name,
      description:
        person.headline ??
        (role ? `${role.role} at ${role.entity.name}.` : `${person.name} in the Solana ecosystem.`),
    };
  } catch {
    return { title: 'Person' };
  }
}

const isContributor = (role: string) => /contributor/i.test(role);

export default async function PersonPage({ params }: Props) {
  const { slug } = await params;
  const [profile, editor] = await Promise.all([load(slug), currentEditor()]);
  const network = await loadPersonNetwork(await researchDb(), profile.person.id);
  const { person, projects, organizations, investments, news } = profile;
  const roles = projects.filter((p) => !isContributor(p.role));
  const code = projects.filter((p) => isContributor(p.role));
  const current = [...roles, ...organizations].find((r) => r.isCurrent);
  const subtitle =
    person.headline ??
    (current
      ? `${current.role} at ${current.entity.name}`
      : investments.length
        ? 'Angel investor'
        : null);

  // Work history, current roles first, then the most recent start.
  const experience = [
    ...roles.map((r) => ({ ...r, kind: 'project' as const })),
    ...organizations.map((r) => ({ ...r, kind: 'organization' as const })),
  ].sort(
    (a, b) =>
      Number(b.isCurrent) - Number(a.isCurrent) ||
      (b.startedOn ?? '').localeCompare(a.startedOn ?? ''),
  );
  const investCategories = new Map<string, number>();
  for (const i of investments) {
    const c = i.project.category ?? 'Other';
    investCategories.set(c, (investCategories.get(c) ?? 0) + 1);
  }

  const groups: NavGroup[] = [
    {
      label: 'Overview',
      items: [
        ...(person.bio ? [{ id: 'about', label: 'About' }] : []),
        { id: 'experience', label: 'Work experience', count: experience.length },
      ],
    },
    {
      label: 'Investments',
      items: [{ id: 'investments', label: 'Investments', count: investments.length }],
    },
    {
      label: 'Network',
      items: [
        {
          id: 'network',
          label: 'Related',
          count: network.people.length + network.coInvestors.length,
        },
        ...(code.length ? [{ id: 'code', label: 'Code', count: code.length }] : []),
      ],
    },
    { label: 'Coverage', items: [{ id: 'news', label: 'News', count: news.length }] },
  ];

  return (
    <div className="mr-container is-wide rx-profile-page">
      <Breadcrumbs items={[{ label: 'People', href: '/people' }, { label: person.name }]} />

      <ProfileHero
        image={person.avatarUrl}
        name={person.name}
        shape="round"
        badges={
          <ReviewBadge
            status={person.reviewStatus}
            checkedAt={person.checkedAt}
            checkedBy={person.checkedBy}
          />
        }
        subtitle={subtitle}
        tags={person.location ? <span className="rx-tag">{person.location}</span> : null}
        links={
          <ExternalLinks
            website={person.website}
            twitter={person.twitter}
            github={person.github}
            linkedin={person.linkedin}
          />
        }
        actions={
          <>
            <WatchButton kind="person" slug={person.slug} name={person.name} />
            {editor && (
              <Link
                className="rx-link is-editor"
                href={`/admin/edit/person/${person.id}`}
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
              label="Projects"
              value={String(roles.length)}
              sub={code.length ? `+ ${code.length} as a code contributor` : null}
            />
            <HeroStat label="Organisations" value={String(organizations.length)} />
            <HeroStat
              label="Investments"
              value={String(investments.length)}
              sub={
                investments.filter((i) => i.isLead).length
                  ? `${investments.filter((i) => i.isLead).length} led`
                  : null
              }
            />
            <HeroStat
              label="Latest investment"
              value={investments[0] ? investments[0].project.name : '—'}
              sub={investments[0] ? fmtMonth(investments[0].round.announcedOn) : null}
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
                <Avatar src={person.avatarUrl} name={person.name} size={30} />
                <span className="rx-pnav-idtext">
                  <span className="rx-pnav-name">{person.name}</span>
                  {subtitle && <span className="rx-muted rx-pnav-sub">{subtitle}</span>}
                </span>
              </div>
            }
          />
        }
        main={
          <>
            {person.bio && (
              <Section id="about" title="About">
                <p className="rx-prose-block">{person.bio}</p>
              </Section>
            )}

            <Section id="experience" title="Work experience" count={experience.length}>
              {experience.length === 0 ? (
                <Empty>
                  No roles on record yet. Editors add them with the source that names them — a team
                  page, an announcement, a filing.
                </Empty>
              ) : (
                <ol className="rx-xp">
                  {experience.map((r) => (
                    <li
                      key={`${r.kind}:${r.linkId}`}
                      className={r.isCurrent ? 'is-current' : undefined}
                    >
                      <Avatar
                        src={r.entity.logoUrl}
                        name={r.entity.name}
                        size={40}
                        shape="square"
                      />
                      <div className="rx-xp-body">
                        <span className="rx-xp-role">
                          {r.role}
                          {r.isCurrent ? (
                            <span className="rx-xp-now">Current</span>
                          ) : (
                            <span className="rx-card-flag">Former</span>
                          )}
                        </span>
                        <Link
                          href={
                            r.kind === 'project'
                              ? projectHref(r.entity.slug)
                              : investorHref(r.entity.slug)
                          }
                          className="rx-clear-strong"
                          prefetch={false}
                        >
                          {r.entity.name}
                        </Link>
                        <span className="rx-card-meta">
                          {(r.startedOn || r.endedOn) && (
                            <span className="mr-num">
                              {r.startedOn ? fmtMonth(r.startedOn) : '?'} –{' '}
                              {r.isCurrent ? 'now' : r.endedOn ? fmtMonth(r.endedOn) : '?'}
                            </span>
                          )}
                          <span className="rx-muted">
                            {r.kind === 'project' ? 'Project' : 'Organisation'}
                          </span>
                          <ReviewBadge status={r.reviewStatus} compact />
                          <Sources evidence={r.evidence} />
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            <Section
              id="investments"
              title="Personal investments"
              count={investments.length}
              lead={
                investments.length
                  ? 'Rounds this person joined in their own name, as announced.'
                  : undefined
              }
            >
              {investments.length === 0 ? (
                <Empty>No personal investments on record.</Empty>
              ) : (
                <>
                  {investments.length >= 3 && (
                    <div className="rx-subsec rx-person-mix">
                      <PieChart
                        slices={[...investCategories.entries()].map(([label, value]) => ({
                          label,
                          value,
                        }))}
                        label={`${person.name} investments by category`}
                        inner={0.6}
                        size={150}
                        center={{ value: String(investments.length), caption: 'rounds' }}
                      />
                    </div>
                  )}
                  <ul className="rx-invcards">
                    {investments.map((i) => (
                      <li key={i.linkId}>
                        <Avatar
                          src={i.project.logoUrl}
                          name={i.project.name}
                          size={36}
                          shape="square"
                        />
                        <div className="rx-invcards-body">
                          <Link
                            href={projectHref(i.project.slug)}
                            className="rx-clear-strong"
                            prefetch={false}
                          >
                            {i.project.name}
                          </Link>
                          {i.project.category && (
                            <span className="rx-muted rx-invcards-cat">
                              <span
                                className="rx-tag-dot"
                                style={{ background: colorFor(i.project.category) }}
                                aria-hidden="true"
                              />
                              {i.project.category}
                            </span>
                          )}
                          <span className="rx-invcards-round">
                            <Link
                              href={roundHref(i.round.slug)}
                              className="rx-type-chip"
                              prefetch={false}
                            >
                              {i.round.roundType ?? 'Round'}
                            </Link>
                            <span className="mr-num">
                              {i.round.amountUsd
                                ? formatCompactUsd(i.round.amountUsd)
                                : 'Undisclosed'}
                            </span>
                            {i.isLead && <span className="rx-lead-tag">Lead</span>}
                          </span>
                          <span className="rx-card-meta">
                            <time className="mr-num" dateTime={i.round.announcedOn}>
                              {fmtDay(i.round.announcedOn)}
                            </time>
                            <Sources evidence={i.evidence} />
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Section>

            <Section
              id="network"
              title="Related"
              lead="People and firms this person shares rounds, teams or firms with, from the records above."
            >
              {network.people.length === 0 && network.coInvestors.length === 0 ? (
                <Empty>No connections on record yet.</Empty>
              ) : (
                <div className="rx-charts-2">
                  {network.people.length > 0 && (
                    <div>
                      <h3 className="rx-chart-title">People</h3>
                      <ul className="rx-rolefeed">
                        {network.people.map((p) => (
                          <li key={p.slug}>
                            <Avatar src={p.avatarUrl} name={p.name} size={30} />
                            <span>
                              <Link
                                href={`/people/${p.slug}`}
                                className="rx-clear-strong"
                                prefetch={false}
                              >
                                {p.name}
                              </Link>
                              <span className="rx-under">
                                {p.reasons.map((r) => REASON[r] ?? r).join(' · ')}
                              </span>
                            </span>
                            <span />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {network.coInvestors.length > 0 && (
                    <div>
                      <h3 className="rx-chart-title">Invested alongside</h3>
                      <ul className="rx-rolefeed">
                        {network.coInvestors.map((o) => (
                          <li key={o.slug}>
                            <Avatar src={o.logoUrl} name={o.name} size={30} shape="square" />
                            <Link
                              href={investorHref(o.slug)}
                              className="rx-clear-strong"
                              prefetch={false}
                            >
                              {o.name}
                            </Link>
                            <span className="rx-muted mr-num rx-rolefeed-at">
                              {o.together} {o.together === 1 ? 'round' : 'rounds'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Section>

            {code.length > 0 && (
              <Section
                id="code"
                title="Code contributions"
                count={code.length}
                lead="Public repositories this person has committed to, from GitHub. Contributing code is not the same as working for the project."
              >
                <ul className="rx-cards is-compact">
                  {code.map((r) => (
                    <EntityCard
                      key={r.linkId}
                      href={projectHref(r.entity.slug)}
                      name={r.entity.name}
                      imageUrl={r.entity.logoUrl}
                      sub={r.evidence[0]?.note ?? r.role}
                    >
                      <span className="rx-card-meta">
                        <Sources evidence={r.evidence} />
                      </span>
                    </EntityCard>
                  ))}
                </ul>
              </Section>
            )}

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
            <AsideCard title="Profile">
              <Facts
                items={[
                  {
                    label: 'Headline',
                    value: person.headline,
                    source: (
                      <Sources evidence={forField(profile.evidence, 'headline')} align="end" />
                    ),
                  },
                  { label: 'Location', value: person.location },
                  {
                    label: 'GitHub',
                    value: person.github ? (
                      <a
                        className="rx-clear"
                        href={`https://github.com/${person.github}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {person.github}
                      </a>
                    ) : null,
                  },
                  {
                    label: 'X',
                    value: person.twitter ? (
                      <a
                        className="rx-clear"
                        href={`https://x.com/${person.twitter}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        @{person.twitter}
                      </a>
                    ) : null,
                  },
                ]}
              />
              <div className="rx-check">
                <ReviewBadge
                  status={person.reviewStatus}
                  checkedAt={person.checkedAt}
                  checkedBy={person.checkedBy}
                />
                <Sources evidence={profile.evidence} label="Profile sources" />
              </div>
            </AsideCard>
            <AsideCard title="Follow">
              <div className="rx-aside-actions">
                <WatchButton kind="person" slug={person.slug} name={person.name} />
                <a className="rx-link" href={`/updates/feed.xml?watch=person:${person.slug}`}>
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
