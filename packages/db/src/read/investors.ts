/**
 * Investors: organisations that have joined a funding round (and the people
 * who invest in their own name, through the same links).
 *
 * The profile is the investor's record, its team, its portfolio — every
 * project it backed, through which rounds — and who it invests alongside.
 */

import { sql } from 'drizzle-orm';
import { rows, type Executor } from '../client';
import type { OrgKind, ReviewStatus } from '../schema';
import {
  epoch,
  evidenceFor,
  evidenceOf,
  inList,
  type Curation,
  type EvidenceRef,
  type PartyRef,
  type PersonRef,
  type ProjectRef,
} from './common';
import { findBySlug, newsFor } from './people';
import type { ChangeItem, Lookup, NewsItem } from './project';

export interface OrganizationRecord extends Curation {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly kind: OrgKind | null;
  readonly logoUrl: string | null;
  readonly description: string | null;
  readonly website: string | null;
  readonly twitter: string | null;
  readonly location: string | null;
  readonly foundedYear: number | null;
  readonly isInvestor: boolean;
  readonly lockedFields: readonly string[];
  readonly updatedAt: number;
}

export interface Deal {
  readonly linkId: number;
  readonly isLead: boolean;
  readonly reviewStatus: ReviewStatus;
  readonly round: {
    id: number;
    slug: string;
    roundType: string | null;
    amountUsd: number | null;
    announcedOn: string;
  };
  readonly project: ProjectRef;
  readonly evidence: readonly EvidenceRef[];
}

export interface PortfolioEntry {
  readonly project: ProjectRef;
  readonly deals: readonly Deal[];
  readonly led: boolean;
  readonly firstOn: string;
  readonly lastOn: string;
}

export interface InvestorProfile {
  readonly org: OrganizationRecord;
  readonly evidence: readonly EvidenceRef[];
  readonly team: readonly {
    linkId: number;
    person: PersonRef;
    role: string;
    isCurrent: boolean;
    reviewStatus: ReviewStatus;
    evidence: readonly EvidenceRef[];
  }[];
  readonly deals: readonly Deal[];
  readonly portfolio: readonly PortfolioEntry[];
  readonly coInvestors: readonly { party: PartyRef; together: number }[];
  readonly stats: {
    readonly deals: number;
    readonly leads: number;
    readonly portfolio: number;
    readonly disclosedTotal: number | null;
    readonly firstDeal: string | null;
    readonly lastDeal: string | null;
    readonly last12m: number;
  };
  readonly categories: readonly { category: string; count: number }[];
  readonly roundTypes: readonly { roundType: string; count: number }[];
  readonly byYear: readonly { year: string; count: number }[];
  readonly news: readonly NewsItem[];
  readonly changes: readonly ChangeItem[];
}

export const findOrganizationId = (db: Executor, slug: string): Promise<Lookup<number>> =>
  findBySlug(db, 'organizations', 'organization', slug);

export async function loadInvestorProfile(
  db: Executor,
  id: number,
  now = Date.now(),
): Promise<InvestorProfile | null> {
  const [o] = await rows<{
    id: number;
    slug: string;
    name: string;
    kind: OrgKind | null;
    logo_url: string | null;
    description: string | null;
    website: string | null;
    twitter: string | null;
    location: string | null;
    founded_year: number | null;
    is_investor: boolean;
    locked_fields: string[];
    review_status: ReviewStatus;
    checked_at: number | null;
    checked_by: string | null;
    updated_at: number;
  }>(
    db,
    sql`select id, slug, name, kind, logo_url, description, website, twitter, location, founded_year,
          is_investor, locked_fields, review_status, checked_by, ${epoch('checked_at')} as checked_at,
          ${epoch('updated_at')} as updated_at
        from organizations where id = ${id}`,
  );
  if (!o) return null;

  const [teamRows, dealRows, newsRows, changeRows] = await Promise.all([
    rows<{
      link_id: number;
      id: number;
      slug: string;
      name: string;
      avatar_url: string | null;
      headline: string | null;
      role: string;
      is_current: boolean;
      review_status: ReviewStatus;
    }>(
      db,
      sql`select op.id as link_id, pe.id, pe.slug, pe.name, pe.avatar_url, pe.headline, op.role,
            op.is_current, op.review_status
          from organization_people op join people pe on pe.id = op.person_id and pe.merged_into_id is null
          where op.organization_id = ${id} and op.review_status <> 'rejected'
          order by op.is_current desc, op.role, pe.name`,
    ),
    rows<{
      link_id: number;
      is_lead: boolean;
      review_status: ReviewStatus;
      round_id: number;
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
      sql`select ri.id as link_id, ri.is_lead, ri.review_status, fr.id as round_id, fr.slug as round_slug,
            fr.round_type, fr.amount_usd, fr.announced_on::text, pr.id as project_id, pr.slug as project_slug,
            pr.name as project_name, pr.logo_url, pr.category
          from round_investors ri
          join funding_rounds fr on fr.id = ri.round_id and fr.merged_into_id is null and fr.review_status <> 'rejected'
          join projects pr on pr.id = fr.project_id and pr.merged_into_id is null
          where ri.organization_id = ${id} and ri.review_status <> 'rejected'
          order by fr.announced_on desc, fr.id desc`,
    ),
    newsFor(db, 'organization', id),
    rows<ChangeItem>(
      db,
      sql`select id, ${epoch('at')} as at, actor, action, summary from changes
          where subject_type = 'organization' and subject_id = ${id} order by at desc limit 12`,
    ),
  ]);

  const roundIds = [...new Set(dealRows.map((d) => d.round_id))];
  const coRows = roundIds.length
    ? await rows<{
        party_type: 'organization' | 'person';
        party_id: number;
        slug: string;
        name: string;
        image_url: string | null;
        together: number;
      }>(
        db,
        sql`select case when ri.organization_id is not null then 'organization' else 'person' end as party_type,
              coalesce(o.id, pe.id) as party_id, coalesce(o.slug, pe.slug) as slug, coalesce(o.name, pe.name) as name,
              coalesce(o.logo_url, pe.avatar_url) as image_url, count(distinct ri.round_id)::int as together
            from round_investors ri
            left join organizations o on o.id = ri.organization_id
            left join people pe on pe.id = ri.person_id
            where ri.round_id in ${inList(roundIds)} and ri.review_status <> 'rejected'
              and (ri.organization_id is null or ri.organization_id <> ${id})
            group by 1, 2, 3, 4, 5
            order by together desc, name limit 24`,
      )
    : [];

  const ev = await evidenceFor(db, [
    { type: 'organization', ids: [id] },
    { type: 'organization_person', ids: teamRows.map((t) => t.link_id) },
    { type: 'round_investor', ids: dealRows.map((d) => d.link_id) },
  ]);

  const deals: Deal[] = dealRows.map((d) => ({
    linkId: d.link_id,
    isLead: d.is_lead,
    reviewStatus: d.review_status,
    round: {
      id: d.round_id,
      slug: d.round_slug,
      roundType: d.round_type,
      amountUsd: d.amount_usd,
      announcedOn: d.announced_on,
    },
    project: {
      id: d.project_id,
      slug: d.project_slug,
      name: d.project_name,
      logoUrl: d.logo_url,
      category: d.category,
    },
    evidence: evidenceOf(ev, 'round_investor', d.link_id),
  }));

  const byProject = new Map<number, Deal[]>();
  for (const d of deals) byProject.set(d.project.id, [...(byProject.get(d.project.id) ?? []), d]);
  const portfolio: PortfolioEntry[] = [...byProject.values()]
    .map((list) => {
      const dates = list.map((d) => d.round.announcedOn).sort();
      return {
        project: list[0]!.project,
        deals: list,
        led: list.some((d) => d.isLead),
        firstOn: dates[0]!,
        lastOn: dates[dates.length - 1]!,
      };
    })
    .sort((a, b) => b.lastOn.localeCompare(a.lastOn));

  const count = <K extends string>(values: (K | null)[]) => {
    const m = new Map<K, number>();
    for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const disclosed = deals.filter((d) => d.round.amountUsd !== null);
  const yearAgo = new Date(now - 365 * 86_400_000).toISOString().slice(0, 10);
  const dates = deals.map((d) => d.round.announcedOn).sort();

  return {
    org: {
      id: o.id,
      slug: o.slug,
      name: o.name,
      kind: o.kind,
      logoUrl: o.logo_url,
      description: o.description,
      website: o.website,
      twitter: o.twitter,
      location: o.location,
      foundedYear: o.founded_year,
      isInvestor: o.is_investor,
      lockedFields: o.locked_fields ?? [],
      reviewStatus: o.review_status,
      checkedAt: o.checked_at,
      checkedBy: o.checked_by,
      updatedAt: o.updated_at,
    },
    evidence: evidenceOf(ev, 'organization', id),
    team: teamRows.map((t) => ({
      linkId: t.link_id,
      person: {
        id: t.id,
        slug: t.slug,
        name: t.name,
        avatarUrl: t.avatar_url,
        headline: t.headline,
      },
      role: t.role,
      isCurrent: t.is_current,
      reviewStatus: t.review_status,
      evidence: evidenceOf(ev, 'organization_person', t.link_id),
    })),
    deals,
    portfolio,
    coInvestors: coRows.map((c) => ({
      party: {
        type: c.party_type,
        id: c.party_id,
        slug: c.slug,
        name: c.name,
        imageUrl: c.image_url,
      },
      together: c.together,
    })),
    stats: {
      deals: deals.length,
      leads: deals.filter((d) => d.isLead).length,
      portfolio: portfolio.length,
      disclosedTotal: disclosed.length
        ? disclosed.reduce((s, d) => s + d.round.amountUsd!, 0)
        : null,
      firstDeal: dates[0] ?? null,
      lastDeal: dates[dates.length - 1] ?? null,
      last12m: deals.filter((d) => d.round.announcedOn >= yearAgo).length,
    },
    categories: count(portfolio.map((p) => p.project.category)).map(([category, n]) => ({
      category,
      count: n,
    })),
    roundTypes: count(deals.map((d) => d.round.roundType)).map(([roundType, n]) => ({
      roundType,
      count: n,
    })),
    byYear: count(deals.map((d) => d.round.announcedOn.slice(0, 4)))
      .map(([year, n]) => ({ year, count: n }))
      .sort((a, b) => a.year.localeCompare(b.year)),
    news: newsRows,
    changes: changeRows,
  };
}

// ---------------------------------------------------------------------------
// Directory
// ---------------------------------------------------------------------------

export interface InvestorRow {
  readonly type: 'organization' | 'person';
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly imageUrl: string | null;
  readonly kind: OrgKind | null;
  readonly deals: number;
  readonly leads: number;
  readonly portfolio: number;
  readonly last12m: number;
  readonly lastDeal: string | null;
  readonly firstDeal: string | null;
  readonly categories: readonly string[];
  readonly roundTypes: readonly string[];
  readonly recent: readonly { slug: string; name: string; logoUrl: string | null }[];
  readonly reviewStatus: ReviewStatus;
  readonly checkedAt: number | null;
}

/** Every investor — organisations and individuals — with deal counts. */
export async function loadInvestors(db: Executor, now = Date.now()): Promise<InvestorRow[]> {
  const yearAgo = new Date(now - 365 * 86_400_000).toISOString().slice(0, 10);
  const found = await rows<{
    party_type: 'organization' | 'person';
    id: number;
    slug: string;
    name: string;
    image_url: string | null;
    kind: OrgKind | null;
    review_status: ReviewStatus;
    checked_at: number | null;
    deals: number;
    leads: number;
    portfolio: number;
    last12m: number;
    last_deal: string | null;
    first_deal: string | null;
    categories: string[] | null;
    round_types: string[] | null;
    recent: { slug: string; name: string; logoUrl: string | null }[] | null;
  }>(
    db,
    sql`
    with d as (
      select case when ri.organization_id is not null then 'organization' else 'person' end as party_type,
        coalesce(ri.organization_id, ri.person_id) as party_id, ri.is_lead, fr.announced_on, fr.round_type,
        pr.id as project_id, pr.slug as project_slug, pr.name as project_name, pr.logo_url, pr.category
      from round_investors ri
      join funding_rounds fr on fr.id = ri.round_id and fr.merged_into_id is null and fr.review_status <> 'rejected'
      join projects pr on pr.id = fr.project_id and pr.merged_into_id is null
      where ri.review_status <> 'rejected'
    ),
    agg as (
      select party_type, party_id, count(*)::int as deals, count(*) filter (where is_lead)::int as leads,
        count(distinct project_id)::int as portfolio,
        count(*) filter (where announced_on >= ${yearAgo}::date)::int as last12m,
        max(announced_on)::text as last_deal, min(announced_on)::text as first_deal,
        array_remove(array_agg(distinct category), null) as categories,
        array_remove(array_agg(distinct round_type), null) as round_types
      from d group by party_type, party_id
    ),
    recent as (
      select party_type, party_id, jsonb_agg(jsonb_build_object('slug', project_slug, 'name', project_name, 'logoUrl', logo_url)
        order by announced_on desc) filter (where rn <= 4) as items
      from (
        select *, row_number() over (partition by party_type, party_id order by announced_on desc) as rn
        from (select distinct on (party_type, party_id, project_id) * from d
              order by party_type, party_id, project_id, announced_on desc) x
      ) ranked group by party_type, party_id
    )
    select a.party_type, a.party_id as id, coalesce(o.slug, pe.slug) as slug, coalesce(o.name, pe.name) as name,
      coalesce(o.logo_url, pe.avatar_url) as image_url, o.kind,
      coalesce(o.review_status, pe.review_status) as review_status,
      ${epoch('coalesce(o.checked_at, pe.checked_at)')} as checked_at,
      a.deals, a.leads, a.portfolio, a.last12m, a.last_deal, a.first_deal, a.categories, a.round_types,
      r.items as recent
    from agg a
    left join organizations o on a.party_type = 'organization' and o.id = a.party_id
    left join people pe on a.party_type = 'person' and pe.id = a.party_id
    left join recent r on r.party_type = a.party_type and r.party_id = a.party_id
    where coalesce(o.merged_into_id, pe.merged_into_id) is null
      and coalesce(o.review_status, pe.review_status) <> 'rejected'`,
  );
  return found.map((r) => ({
    type: r.party_type,
    id: r.id,
    slug: r.slug,
    name: r.name,
    imageUrl: r.image_url,
    kind: r.kind,
    deals: r.deals,
    leads: r.leads,
    portfolio: r.portfolio,
    last12m: r.last12m,
    lastDeal: r.last_deal,
    firstDeal: r.first_deal,
    categories: r.categories ?? [],
    roundTypes: r.round_types ?? [],
    recent: r.recent ?? [],
    reviewStatus: r.review_status,
    checkedAt: r.checked_at,
  }));
}
