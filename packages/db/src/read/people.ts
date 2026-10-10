/**
 * People: a profile with every project and organisation a person is connected
 * to and every round they invested in personally, and the people directory.
 */

import { normalizeName } from '@marketroom/core';
import { sql } from 'drizzle-orm';
import { rows, type Executor } from '../client';
import type { ReviewStatus } from '../schema';
import {
  epoch,
  evidenceFor,
  evidenceOf,
  type Curation,
  type EvidenceRef,
  type OrgRef,
  type ProjectRef,
} from './common';
import type { ChangeItem, Lookup, NewsItem } from './project';

export interface PersonRecord extends Curation {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly headline: string | null;
  readonly bio: string | null;
  readonly location: string | null;
  readonly twitter: string | null;
  readonly github: string | null;
  readonly linkedin: string | null;
  readonly website: string | null;
  readonly lockedFields: readonly string[];
  readonly updatedAt: number;
}

export interface PersonRole<T> {
  readonly linkId: number;
  readonly entity: T;
  readonly role: string;
  readonly isCurrent: boolean;
  readonly startedOn: string | null;
  readonly endedOn: string | null;
  readonly reviewStatus: ReviewStatus;
  readonly evidence: readonly EvidenceRef[];
}

export interface PersonInvestment {
  readonly linkId: number;
  readonly round: {
    slug: string;
    roundType: string | null;
    amountUsd: number | null;
    announcedOn: string;
  };
  readonly project: ProjectRef;
  readonly isLead: boolean;
  readonly reviewStatus: ReviewStatus;
  readonly evidence: readonly EvidenceRef[];
}

export interface PersonProfile {
  readonly person: PersonRecord;
  readonly evidence: readonly EvidenceRef[];
  readonly projects: readonly PersonRole<ProjectRef>[];
  readonly organizations: readonly PersonRole<OrgRef>[];
  readonly investments: readonly PersonInvestment[];
  readonly news: readonly NewsItem[];
  readonly changes: readonly ChangeItem[];
}

export async function findPersonId(db: Executor, slug: string): Promise<Lookup<number>> {
  return findBySlug(db, 'people', 'person', slug);
}

/** Shared slug lookup with merge redirects and alias fallback. */
export async function findBySlug(
  db: Executor,
  table: 'people' | 'organizations' | 'funding_rounds',
  subjectType: 'person' | 'organization' | 'round',
  slug: string,
): Promise<Lookup<number>> {
  const [hit] = await rows<{ id: number; merged_into_id: number | null; review_status: string }>(
    db,
    sql`select id, merged_into_id, review_status from ${sql.identifier(table)} where slug = ${slug}`,
  );
  if (hit && !hit.merged_into_id && hit.review_status !== 'rejected')
    return { kind: 'found', value: hit.id };
  let target: number | null = hit?.merged_into_id ?? null;
  if (!target && subjectType !== 'round') {
    target =
      (
        await rows<{ subject_id: number }>(
          db,
          sql`select subject_id from aliases where subject_type = ${subjectType}
              and alias = ${normalizeName(slug.replace(/-/g, ' '))} limit 1`,
        )
      )[0]?.subject_id ?? null;
  }
  if (!target) return { kind: 'missing' };
  // Follow a chain of merges to the record that survived.
  for (let hop = 0; hop < 5; hop += 1) {
    const current: number = target;
    const found: { slug: string; merged_into_id: number | null }[] = await rows(
      db,
      sql`select slug, merged_into_id from ${sql.identifier(table)} where id = ${current}`,
    );
    const row = found[0];
    if (!row) return { kind: 'missing' };
    if (!row.merged_into_id)
      return row.slug === slug ? { kind: 'missing' } : { kind: 'redirect', slug: row.slug };
    target = row.merged_into_id;
  }
  return { kind: 'missing' };
}

export async function loadPersonProfile(db: Executor, id: number): Promise<PersonProfile | null> {
  const [p] = await rows<{
    id: number;
    slug: string;
    name: string;
    avatar_url: string | null;
    headline: string | null;
    bio: string | null;
    location: string | null;
    twitter: string | null;
    github: string | null;
    linkedin: string | null;
    website: string | null;
    locked_fields: string[];
    review_status: ReviewStatus;
    checked_at: number | null;
    checked_by: string | null;
    updated_at: number;
  }>(
    db,
    sql`select id, slug, name, avatar_url, headline, bio, location, twitter, github, linkedin, website,
          locked_fields, review_status, checked_by, ${epoch('checked_at')} as checked_at,
          ${epoch('updated_at')} as updated_at
        from people where id = ${id}`,
  );
  if (!p) return null;

  const [projectRows, orgRows, investmentRows, newsRows, changeRows] = await Promise.all([
    rows<RoleRow & { logo_url: string | null; category: string | null }>(
      db,
      sql`select pp.id as link_id, pr.id, pr.slug, pr.name, pr.logo_url, pr.category, pp.role, pp.is_current,
            pp.started_on::text, pp.ended_on::text, pp.review_status
          from project_people pp join projects pr on pr.id = pp.project_id
          where pp.person_id = ${id} and pp.review_status <> 'rejected' and pr.merged_into_id is null
          order by pp.is_current desc, pp.started_on desc nulls last, pr.name`,
    ),
    rows<RoleRow & { logo_url: string | null; kind: string | null }>(
      db,
      sql`select op.id as link_id, o.id, o.slug, o.name, o.logo_url, o.kind, op.role, op.is_current,
            op.started_on::text, op.ended_on::text, op.review_status
          from organization_people op join organizations o on o.id = op.organization_id
          where op.person_id = ${id} and op.review_status <> 'rejected' and o.merged_into_id is null
          order by op.is_current desc, op.started_on desc nulls last, o.name`,
    ),
    rows<{
      link_id: number;
      is_lead: boolean;
      review_status: ReviewStatus;
      round_slug: string;
      round_type: string | null;
      amount_usd: number | null;
      announced_on: string;
      project_id: number;
      project_slug: string;
      project_name: string;
      logo_url: string | null;
      category: string | null;
    }>(
      db,
      sql`select ri.id as link_id, ri.is_lead, ri.review_status, fr.slug as round_slug, fr.round_type,
            fr.amount_usd, fr.announced_on::text, pr.id as project_id, pr.slug as project_slug,
            pr.name as project_name, pr.logo_url, pr.category
          from round_investors ri
          join funding_rounds fr on fr.id = ri.round_id and fr.merged_into_id is null and fr.review_status <> 'rejected'
          join projects pr on pr.id = fr.project_id
          where ri.person_id = ${id} and ri.review_status <> 'rejected'
          order by fr.announced_on desc`,
    ),
    newsFor(db, 'person', id),
    rows<ChangeItem>(
      db,
      sql`select id, ${epoch('at')} as at, actor, action, summary from changes
          where subject_type = 'person' and subject_id = ${id} order by at desc limit 12`,
    ),
  ]);

  const ev = await evidenceFor(db, [
    { type: 'person', ids: [id] },
    { type: 'project_person', ids: projectRows.map((r) => r.link_id) },
    { type: 'organization_person', ids: orgRows.map((r) => r.link_id) },
    { type: 'round_investor', ids: investmentRows.map((r) => r.link_id) },
  ]);

  return {
    person: {
      id: p.id,
      slug: p.slug,
      name: p.name,
      avatarUrl: p.avatar_url,
      headline: p.headline,
      bio: p.bio,
      location: p.location,
      twitter: p.twitter,
      github: p.github,
      linkedin: p.linkedin,
      website: p.website,
      lockedFields: p.locked_fields ?? [],
      reviewStatus: p.review_status,
      checkedAt: p.checked_at,
      checkedBy: p.checked_by,
      updatedAt: p.updated_at,
    },
    evidence: evidenceOf(ev, 'person', id),
    projects: projectRows.map((r) => ({
      ...role(r, evidenceOf(ev, 'project_person', r.link_id)),
      entity: { id: r.id, slug: r.slug, name: r.name, logoUrl: r.logo_url, category: r.category },
    })),
    organizations: orgRows.map((r) => ({
      ...role(r, evidenceOf(ev, 'organization_person', r.link_id)),
      entity: { id: r.id, slug: r.slug, name: r.name, logoUrl: r.logo_url, kind: r.kind },
    })),
    investments: investmentRows.map((r) => ({
      linkId: r.link_id,
      isLead: r.is_lead,
      reviewStatus: r.review_status,
      round: {
        slug: r.round_slug,
        roundType: r.round_type,
        amountUsd: r.amount_usd,
        announcedOn: r.announced_on,
      },
      project: {
        id: r.project_id,
        slug: r.project_slug,
        name: r.project_name,
        logoUrl: r.logo_url,
        category: r.category,
      },
      evidence: evidenceOf(ev, 'round_investor', r.link_id),
    })),
    news: newsRows,
    changes: changeRows,
  };
}

interface RoleRow {
  link_id: number;
  id: number;
  slug: string;
  name: string;
  role: string;
  is_current: boolean;
  started_on: string | null;
  ended_on: string | null;
  review_status: ReviewStatus;
}

const role = (r: RoleRow, evidence: readonly EvidenceRef[]) => ({
  linkId: r.link_id,
  role: r.role,
  isCurrent: r.is_current,
  startedOn: r.started_on,
  endedOn: r.ended_on,
  reviewStatus: r.review_status,
  evidence,
});

export async function newsFor(
  db: Executor,
  subjectType: 'project' | 'person' | 'organization',
  id: number,
  limit = 20,
): Promise<NewsItem[]> {
  const found = await rows<{
    id: number;
    url: string;
    title: string;
    publisher: string;
    published_at: number;
    summary: string | null;
    matched_by: string;
    review_status: ReviewStatus;
  }>(
    db,
    sql`select n.id, n.url, n.title, n.publisher, ${epoch('n.published_at')} as published_at, n.summary,
          m.matched_by, m.review_status
        from news_mentions m join news n on n.id = m.news_id
        where m.subject_type = ${subjectType} and m.subject_id = ${id} and m.review_status <> 'rejected'
          and not n.hidden
        order by n.published_at desc limit ${limit}`,
  );
  return found.map((n) => ({
    id: n.id,
    url: n.url,
    title: n.title,
    publisher: n.publisher,
    publishedAt: n.published_at,
    summary: n.summary,
    matchedBy: n.matched_by,
    reviewStatus: n.review_status,
  }));
}

// ---------------------------------------------------------------------------
// Directory
// ---------------------------------------------------------------------------

export interface PersonRow {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly headline: string | null;
  readonly roles: readonly {
    type: 'project' | 'organization';
    slug: string;
    name: string;
    role: string;
    isCurrent: boolean;
  }[];
  readonly investments: number;
  readonly reviewStatus: ReviewStatus;
  readonly checkedAt: number | null;
  readonly twitter: string | null;
  readonly github: string | null;
}

export async function loadPeople(db: Executor): Promise<PersonRow[]> {
  const found = await rows<{
    id: number;
    slug: string;
    name: string;
    avatar_url: string | null;
    headline: string | null;
    review_status: ReviewStatus;
    checked_at: number | null;
    twitter: string | null;
    github: string | null;
    roles:
      | {
          type: 'project' | 'organization';
          slug: string;
          name: string;
          role: string;
          isCurrent: boolean;
        }[]
      | null;
    investments: number;
  }>(
    db,
    sql`
    with roles as (
      select pp.person_id, jsonb_agg(jsonb_build_object(
          'type', 'project', 'slug', pr.slug, 'name', pr.name, 'role', pp.role, 'isCurrent', pp.is_current)
        order by pp.is_current desc, pr.name) as items
      from project_people pp join projects pr on pr.id = pp.project_id and pr.merged_into_id is null
      where pp.review_status <> 'rejected' group by pp.person_id
    ),
    org_roles as (
      select op.person_id, jsonb_agg(jsonb_build_object(
          'type', 'organization', 'slug', o.slug, 'name', o.name, 'role', op.role, 'isCurrent', op.is_current)
        order by op.is_current desc, o.name) as items
      from organization_people op join organizations o on o.id = op.organization_id and o.merged_into_id is null
      where op.review_status <> 'rejected' group by op.person_id
    ),
    inv as (
      select ri.person_id, count(*)::int as n from round_investors ri
      join funding_rounds fr on fr.id = ri.round_id and fr.merged_into_id is null and fr.review_status <> 'rejected'
      where ri.person_id is not null and ri.review_status <> 'rejected' group by ri.person_id
    )
    select p.id, p.slug, p.name, p.avatar_url, p.headline, p.review_status, p.twitter, p.github,
      ${epoch('p.checked_at')} as checked_at,
      coalesce(o.items, '[]'::jsonb) || coalesce(r.items, '[]'::jsonb) as roles,
      coalesce(inv.n, 0) as investments
    from people p
    left join roles r on r.person_id = p.id
    left join org_roles o on o.person_id = p.id
    left join inv on inv.person_id = p.id
    where p.merged_into_id is null and p.review_status <> 'rejected'`,
  );
  return found.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    avatarUrl: r.avatar_url,
    headline: r.headline,
    roles: r.roles ?? [],
    investments: r.investments,
    reviewStatus: r.review_status,
    checkedAt: r.checked_at,
    twitter: r.twitter,
    github: r.github,
  }));
}

export interface RecentRole {
  readonly linkId: string;
  readonly at: number;
  readonly role: string;
  readonly isCurrent: boolean;
  readonly reviewStatus: ReviewStatus;
  readonly person: { slug: string; name: string; avatarUrl: string | null };
  readonly entity: {
    type: 'project' | 'organization';
    slug: string;
    name: string;
    logoUrl: string | null;
  };
}

/**
 * The roles most recently put on record — someone joining a team or a firm,
 * or a role being marked as former. Open-source contributions are left out:
 * they come in bulk from GitHub and are not role changes.
 */
export async function loadRecentRoles(db: Executor, limit = 10): Promise<RecentRole[]> {
  const found = await rows<{
    link_id: string;
    at: number;
    role: string;
    is_current: boolean;
    review_status: ReviewStatus;
    person_slug: string;
    person_name: string;
    avatar_url: string | null;
    type: 'project' | 'organization';
    slug: string;
    name: string;
    logo_url: string | null;
  }>(
    db,
    sql`select * from (
          select 'p' || pp.id as link_id, ${epoch('pp.created_at')} as at, pp.role, pp.is_current,
            pp.review_status, pe.slug as person_slug, pe.name as person_name, pe.avatar_url,
            'project' as type, pr.slug, pr.name, pr.logo_url
          from project_people pp
          join people pe on pe.id = pp.person_id and pe.merged_into_id is null and pe.review_status <> 'rejected'
          join projects pr on pr.id = pp.project_id and pr.merged_into_id is null
          where pp.review_status <> 'rejected' and pp.role not ilike '%contributor%'
          union all
          select 'o' || op.id, ${epoch('op.created_at')}, op.role, op.is_current, op.review_status,
            pe.slug, pe.name, pe.avatar_url, 'organization', o.slug, o.name, o.logo_url
          from organization_people op
          join people pe on pe.id = op.person_id and pe.merged_into_id is null and pe.review_status <> 'rejected'
          join organizations o on o.id = op.organization_id and o.merged_into_id is null
          where op.review_status <> 'rejected'
        ) r order by at desc limit ${limit}`,
  );
  return found.map((r) => ({
    linkId: r.link_id,
    at: Number(r.at),
    role: r.role,
    isCurrent: r.is_current,
    reviewStatus: r.review_status,
    person: { slug: r.person_slug, name: r.person_name, avatarUrl: r.avatar_url },
    entity: { type: r.type, slug: r.slug, name: r.name, logoUrl: r.logo_url },
  }));
}

export interface RelatedPerson {
  readonly slug: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly headline: string | null;
  /** How they are connected: shared rounds, a shared team, a shared firm. */
  readonly reasons: readonly ('co-invested' | 'same team' | 'same firm')[];
  readonly weight: number;
}

export interface Network {
  readonly people: readonly RelatedPerson[];
  /** Organisations that joined the same rounds, by rounds shared. */
  readonly coInvestors: readonly {
    slug: string;
    name: string;
    logoUrl: string | null;
    together: number;
  }[];
}

/** Who a person is connected to through the records: rounds, teams and firms they share. */
export async function loadPersonNetwork(db: Executor, id: number, limit = 8): Promise<Network> {
  const [people, orgs] = await Promise.all([
    rows<{
      slug: string;
      name: string;
      avatar_url: string | null;
      headline: string | null;
      reasons: string[];
      weight: number;
    }>(
      db,
      sql`select pe.slug, pe.name, pe.avatar_url, pe.headline,
            array_agg(distinct x.reason) as reasons, sum(x.w)::int as weight
          from (
            select ri.person_id as pid, 1 as w, 'co-invested' as reason from round_investors ri
            where ri.person_id is not null and ri.person_id <> ${id} and ri.review_status <> 'rejected'
              and ri.round_id in (select round_id from round_investors where person_id = ${id} and review_status <> 'rejected')
            union all
            select pp.person_id, 2, 'same team' from project_people pp
            where pp.person_id <> ${id} and pp.review_status <> 'rejected' and pp.role not ilike '%contributor%'
              and pp.project_id in (select project_id from project_people where person_id = ${id}
                and review_status <> 'rejected' and role not ilike '%contributor%')
            union all
            select op.person_id, 2, 'same firm' from organization_people op
            where op.person_id <> ${id} and op.review_status <> 'rejected'
              and op.organization_id in (select organization_id from organization_people where person_id = ${id}
                and review_status <> 'rejected')
          ) x
          join people pe on pe.id = x.pid and pe.merged_into_id is null and pe.review_status <> 'rejected'
          group by pe.id, pe.slug, pe.name, pe.avatar_url, pe.headline
          order by weight desc, pe.name limit ${limit}`,
    ),
    rows<{ slug: string; name: string; logo_url: string | null; together: number }>(
      db,
      sql`select o.slug, o.name, o.logo_url, count(distinct ri.round_id)::int as together
          from round_investors ri
          join organizations o on o.id = ri.organization_id and o.merged_into_id is null and o.review_status <> 'rejected'
          where ri.review_status <> 'rejected'
            and ri.round_id in (select round_id from round_investors where person_id = ${id} and review_status <> 'rejected')
          group by o.id, o.slug, o.name, o.logo_url
          order by together desc, o.name limit ${limit}`,
    ),
  ]);
  return {
    people: people.map((p) => ({
      slug: p.slug,
      name: p.name,
      avatarUrl: p.avatar_url,
      headline: p.headline,
      reasons: (p.reasons ?? []) as RelatedPerson['reasons'][number][],
      weight: Number(p.weight),
    })),
    coInvestors: orgs.map((o) => ({
      slug: o.slug,
      name: o.name,
      logoUrl: o.logo_url,
      together: Number(o.together),
    })),
  };
}
