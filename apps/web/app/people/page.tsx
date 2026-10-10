import { formatCompactUsd, normalizeName } from '@marketroom/core';
import type { PersonRow } from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { investorHref, projectHref } from '@/components/research/Entities';
import { ReviewBadge } from '@/components/research/Evidence';
import { ActiveFilters, FacetGroup, SearchBox } from '@/components/research/Filters';
import { ago, fmtDay } from '@/components/research/format';
import { Building } from '@/components/research/Profile';
import { Avatar } from '@/components/sol/Avatar';
import { Pager } from '@/components/sol/Filters';
import { PageHead } from '@/components/sol/primitives';
import { one, pageOf, type Params } from '@/lib/query';
import { importState, peopleRows, recentRoles, roundRows } from '@/lib/research';

export const metadata: Metadata = {
  title: 'People',
  description:
    'Founders, builders and investors in the Solana ecosystem, connected to the projects and organisations they work with.',
};

export const dynamic = 'force-dynamic';

const BASE = '/people';
const PAGE = 40;

const GROUPS: Record<string, { label: string; test: (p: PersonRow) => boolean }> = {
  founders: {
    label: 'Founders & executives',
    test: (p) => p.roles.some((r) => /founder|ceo|cto|coo|chief|president|head/i.test(r.role)),
  },
  investors: { label: 'Angel investors', test: (p) => p.investments > 0 },
  partners: {
    label: 'At an investment firm',
    test: (p) => p.roles.some((r) => r.type === 'organization'),
  },
  contributors: {
    label: 'Open-source contributors',
    test: (p) => p.roles.some((r) => /contributor/i.test(r.role)),
  },
};

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const [all, state, recent, rounds] = await Promise.all([
    peopleRows(),
    importState(),
    recentRoles(),
    roundRows(),
  ]);
  const q = normalizeName(one(params.q));
  const group = one(params.group);
  const review = one(params.review);

  const matched = all
    .filter(
      (p) =>
        !q ||
        normalizeName(
          `${p.name} ${p.github ?? ''} ${p.twitter ?? ''} ${p.roles.map((r) => r.name).join(' ')}`,
        ).includes(q),
    )
    .filter((p) => !group || GROUPS[group]?.test(p))
    .filter((p) => !review || p.reviewStatus === review)
    .sort(
      (a, b) =>
        Number(b.reviewStatus === 'verified') - Number(a.reviewStatus === 'verified') ||
        b.roles.filter((r) => !/contributor/i.test(r.role)).length -
          a.roles.filter((r) => !/contributor/i.test(r.role)).length ||
        b.investments - a.investments ||
        a.name.localeCompare(b.name),
    );
  const pages = Math.max(1, Math.ceil(matched.length / PAGE));
  const page = Math.min(pageOf(params), pages);
  const shown = matched.slice((page - 1) * PAGE, page * PAGE);
  const count = (test: (p: PersonRow) => boolean) => all.filter(test).length;
  const landing = !q && !group && !review && page === 1;
  // The most connected people: named roles on teams and at firms first, then
  // the most active angels.
  const named = (p: PersonRow) => p.roles.filter((r) => !/contributor/i.test(r.role)).length;
  const featured = all
    .filter((p) => named(p) > 0 || p.investments > 0)
    .sort(
      (a, b) =>
        named(b) - named(a) ||
        b.investments - a.investments ||
        Number(!!b.avatarUrl) - Number(!!a.avatarUrl),
    )
    .slice(0, 14);
  const angelDeals = rounds
    .flatMap((r) =>
      r.investors.filter((i) => i.type === 'person').map((i) => ({ round: r, person: i })),
    )
    .slice(0, 8);

  return (
    <div className="mr-container">
      <PageHead
        title="People"
        lead="Founders, team members, angels and partners — each connected to the projects, rounds and organisations a source puts them in. Roles come from the cited source, never from a guess."
        meta={<span>{all.length.toLocaleString('en-US')} people</span>}
      />
      {all.length === 0 ? (
        <Building what="The people directory" running={state.running || state.pending.length > 0} />
      ) : (
        <>
          {landing && (
            <>
              <form action={BASE} className="rx-bigsearch" role="search">
                <label htmlFor="people-q" className="sr-only">
                  Search people
                </label>
                <input
                  id="people-q"
                  name="q"
                  type="search"
                  placeholder="Search a founder, an angel, a GitHub handle or a project"
                />
                <button type="submit">Search</button>
              </form>
              <dl className="rx-kpis is-compact">
                <div className="rx-kpi">
                  <dt className="rx-kpi-label">People on record</dt>
                  <dd className="rx-kpi-body">
                    <span className="rx-kpi-value mr-num">
                      {all.length.toLocaleString('en-US')}
                    </span>
                  </dd>
                </div>
                {Object.entries(GROUPS)
                  .filter(([, g]) => count(g.test) > 0)
                  .map(([key, g]) => (
                    <div key={key} className="rx-kpi">
                      <dt className="rx-kpi-label">
                        <Link href={`${BASE}?group=${key}`} className="rx-kpi-link">
                          {g.label}
                        </Link>
                      </dt>
                      <dd className="rx-kpi-body">
                        <span className="rx-kpi-value mr-num">
                          {count(g.test).toLocaleString('en-US')}
                        </span>
                      </dd>
                    </div>
                  ))}
              </dl>
              {featured.length > 0 && (
                <section className="rx-panel" aria-labelledby="featured-h">
                  <header className="rx-panel-head">
                    <h2 className="rx-panel-title" id="featured-h">
                      Most connected
                    </h2>
                    <span className="rx-muted">By named roles, then rounds invested in</span>
                  </header>
                  <div
                    className="rx-carousel"
                    role="region"
                    aria-labelledby="featured-h"
                    tabIndex={0}
                  >
                    <ul>
                      {featured.map((p) => {
                        const main = p.roles.find((r) => !/contributor/i.test(r.role));
                        return (
                          <li key={p.id}>
                            <Link
                              href={`/people/${p.slug}`}
                              className="rx-person-tile"
                              prefetch={false}
                            >
                              <Avatar src={p.avatarUrl} name={p.name} size={72} />
                              <span className="rx-person-tile-name">{p.name}</span>
                              <span className="rx-person-tile-org">
                                {main ? main.name : 'Angel investor'}
                              </span>
                              <span className="rx-person-tile-role">
                                {main
                                  ? main.role
                                  : `${p.investments} ${p.investments === 1 ? 'round' : 'rounds'} on record`}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </section>
              )}
              {recent.length > 0 && (
                <section className="rx-panel" aria-labelledby="recent-h">
                  <header className="rx-panel-head">
                    <h2 className="rx-panel-title" id="recent-h">
                      Recently recorded roles
                    </h2>
                    <Link href="/updates" className="rx-more">
                      All updates
                    </Link>
                  </header>
                  <ul className="rx-rolefeed">
                    {recent.map((r) => (
                      <li key={r.linkId}>
                        <Avatar src={r.person.avatarUrl} name={r.person.name} size={30} />
                        <span>
                          <Link
                            href={`/people/${r.person.slug}`}
                            className="rx-clear-strong"
                            prefetch={false}
                          >
                            {r.person.name}
                          </Link>{' '}
                          <span className="rx-muted">{r.isCurrent ? 'is' : 'was'}</span> {r.role}{' '}
                          <span className="rx-muted">at</span>{' '}
                          <Link
                            href={
                              r.entity.type === 'project'
                                ? projectHref(r.entity.slug)
                                : investorHref(r.entity.slug)
                            }
                            className="rx-entity-inline"
                            prefetch={false}
                          >
                            <Avatar
                              src={r.entity.logoUrl}
                              name={r.entity.name}
                              size={18}
                              shape="square"
                            />
                            {r.entity.name}
                          </Link>
                        </span>
                        <span className="rx-muted rx-rolefeed-at">
                          {r.reviewStatus === 'verified' ? 'checked · ' : ''}
                          {ago(r.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {angelDeals.length > 0 && (
                <section className="rx-panel" aria-labelledby="angels-h">
                  <header className="rx-panel-head">
                    <h2 className="rx-panel-title" id="angels-h">
                      Latest angel investments
                    </h2>
                    <Link href={`${BASE}?group=investors`} className="rx-more">
                      All angels
                    </Link>
                  </header>
                  <ul className="rx-rolefeed">
                    {angelDeals.map(({ round: r, person: i }) => (
                      <li key={`${r.id}:${i.slug}`}>
                        <Avatar src={i.imageUrl} name={i.name} size={30} />
                        <span>
                          <Link
                            href={`/people/${i.slug}`}
                            className="rx-clear-strong"
                            prefetch={false}
                          >
                            {i.name}
                          </Link>{' '}
                          <span className="rx-muted">{i.isLead ? 'led' : 'joined'}</span>{' '}
                          <Link
                            href={projectHref(r.project.slug)}
                            className="rx-entity-inline"
                            prefetch={false}
                          >
                            <Avatar
                              src={r.project.logoUrl}
                              name={r.project.name}
                              size={18}
                              shape="square"
                            />
                            {r.project.name}
                          </Link>
                          <span className="rx-muted">
                            {'’s '}
                            {r.roundType ?? 'round'}
                            {r.amountUsd ? ` · ${formatCompactUsd(r.amountUsd)}` : ''}
                          </span>
                        </span>
                        <span className="rx-muted rx-rolefeed-at">{fmtDay(r.announcedOn)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <h2 className="rx-section-title">Directory</h2>
            </>
          )}
          <div className="rx-db">
            <div className="rx-filters" aria-label="Filters">
              <FacetGroup
                title="Role"
                param="group"
                options={Object.entries(GROUPS).map(([value, g]) => ({
                  value,
                  label: g.label,
                  count: count(g.test),
                }))}
                base={BASE}
                params={params}
              />
              <FacetGroup
                title="Profile check"
                param="review"
                options={[
                  {
                    value: 'verified',
                    label: 'Checked by an editor',
                    count: count((p) => p.reviewStatus === 'verified'),
                  },
                  {
                    value: 'needs_review',
                    label: 'Unconfirmed',
                    count: count((p) => p.reviewStatus === 'needs_review'),
                  },
                  {
                    value: 'unreviewed',
                    label: 'Imported',
                    count: count((p) => p.reviewStatus === 'unreviewed'),
                  },
                ]}
                base={BASE}
                params={params}
              />
            </div>
            <div>
              <SearchBox
                base={BASE}
                params={params}
                placeholder="Search by name, handle or project"
                label="Search people"
              />
              <div className="rx-results-head">
                <p className="rx-results-count" role="status">
                  <strong>{matched.length.toLocaleString('en-US')}</strong>{' '}
                  {matched.length === 1 ? 'person' : 'people'}
                </p>
                <ActiveFilters
                  base={BASE}
                  params={params}
                  labels={{
                    q: (v) => `“${v}”`,
                    group: (v) => GROUPS[v]?.label ?? v,
                    review: (v) => v.replace('_', ' '),
                  }}
                />
              </div>
              {shown.length === 0 ? (
                <p className="rx-empty">No one matches these filters.</p>
              ) : (
                <div className="rx-table-wrap">
                  <table className="rx-table">
                    <caption className="sr-only">People, {matched.length} results</caption>
                    <thead>
                      <tr>
                        <th>Person</th>
                        <th>Connected to</th>
                        <th className="is-num">Investments</th>
                        <th>Profile</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <Link href={`/people/${p.slug}`} className="rx-entity" prefetch={false}>
                              <Avatar src={p.avatarUrl} name={p.name} size={28} />
                              <span className="rx-entity-text">
                                <span className="rx-entity-name">{p.name}</span>
                                {p.headline && <span className="rx-entity-sub">{p.headline}</span>}
                              </span>
                            </Link>
                          </td>
                          <td>
                            <span className="rx-roles">
                              {p.roles.slice(0, 3).map((r) => (
                                <span key={`${r.type}:${r.slug}:${r.role}`}>
                                  <Link
                                    href={
                                      r.type === 'project'
                                        ? projectHref(r.slug)
                                        : investorHref(r.slug)
                                    }
                                    prefetch={false}
                                    className="rx-clear-strong"
                                  >
                                    {r.name}
                                  </Link>{' '}
                                  <span className="rx-muted">
                                    {r.role}
                                    {!r.isCurrent && ' (former)'}
                                  </span>
                                </span>
                              ))}
                              {p.roles.length > 3 && (
                                <span className="rx-muted">+{p.roles.length - 3} more</span>
                              )}
                              {p.roles.length === 0 && <span className="rx-muted">—</span>}
                            </span>
                          </td>
                          <td className="is-num">
                            {p.investments || <span className="rx-muted">—</span>}
                          </td>
                          <td>
                            <ReviewBadge status={p.reviewStatus} checkedAt={p.checkedAt} compact />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pager base={BASE} params={params} current={page} pages={pages} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
