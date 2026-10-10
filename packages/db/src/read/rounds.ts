/**
 * Funding rounds: the round profile — amount, date, type, investors, and the
 * sources that announced it — and the fundraising list.
 */

import { sql } from 'drizzle-orm';
import { rows, type Executor } from '../client';
import type { ReviewStatus } from '../schema';
import {
  epoch,
  evidenceFor,
  evidenceOf,
  rankEvidence,
  type Curation,
  type EvidenceRef,
  type PartyRef,
  type ProjectRef,
} from './common';
import { findBySlug } from './people';
import type { ChangeItem, Lookup, RoundInvestor } from './project';

export interface RoundProfile {
  readonly round: Curation & {
    readonly id: number;
    readonly slug: string;
    readonly roundType: string | null;
    readonly amountUsd: number | null;
    readonly valuationUsd: number | null;
    readonly announcedOn: string;
    readonly notes: string | null;
    readonly lockedFields: readonly string[];
    readonly updatedAt: number;
  };
  readonly project: ProjectRef & { tagline: string | null };
  readonly evidence: readonly EvidenceRef[];
  readonly investors: readonly RoundInvestor[];
  readonly otherRounds: readonly {
    slug: string;
    roundType: string | null;
    amountUsd: number | null;
    announcedOn: string;
  }[];
  readonly nearby: readonly {
    slug: string;
    roundType: string | null;
    amountUsd: number | null;
    announcedOn: string;
    project: ProjectRef;
  }[];
  readonly changes: readonly ChangeItem[];
}

export const findRoundId = (db: Executor, slug: string): Promise<Lookup<number>> =>
  findBySlug(db, 'funding_rounds', 'round', slug);

export async function loadRoundProfile(db: Executor, id: number): Promise<RoundProfile | null> {
  const [r] = await rows<{
    id: number;
    slug: string;
    round_type: string | null;
    amount_usd: number | null;
    valuation_usd: number | null;
    announced_on: string;
    notes: string | null;
    locked_fields: string[];
    review_status: ReviewStatus;
    checked_at: number | null;
    checked_by: string | null;
    updated_at: number;
    project_id: number;
    project_slug: string;
    project_name: string;
    logo_url: string | null;
    category: string | null;
    tagline: string | null;
  }>(
    db,
    sql`select fr.id, fr.slug, fr.round_type, fr.amount_usd, fr.valuation_usd, fr.announced_on::text, fr.notes,
          fr.locked_fields, fr.review_status, ${epoch('fr.checked_at')} as checked_at, fr.checked_by,
          ${epoch('fr.updated_at')} as updated_at, p.id as project_id, p.slug as project_slug,
          p.name as project_name, p.logo_url, p.category, p.tagline
        from funding_rounds fr join projects p on p.id = fr.project_id
        where fr.id = ${id}`,
  );
  if (!r) return null;

  const [investorRows, otherRows, nearbyRows, changeRows] = await Promise.all([
    rows<{
      link_id: number;
      is_lead: boolean;
      name_as_reported: string | null;
      review_status: ReviewStatus;
      party_type: 'organization' | 'person';
      party_id: number;
      slug: string;
      name: string;
      image_url: string | null;
    }>(
      db,
      sql`select ri.id as link_id, ri.is_lead, ri.name_as_reported, ri.review_status,
            case when ri.organization_id is not null then 'organization' else 'person' end as party_type,
            coalesce(o.id, pe.id) as party_id, coalesce(o.slug, pe.slug) as slug,
            coalesce(o.name, pe.name) as name, coalesce(o.logo_url, pe.avatar_url) as image_url
          from round_investors ri
          left join organizations o on o.id = ri.organization_id
          left join people pe on pe.id = ri.person_id
          where ri.round_id = ${id} and ri.review_status <> 'rejected'
          order by ri.is_lead desc, coalesce(o.name, pe.name)`,
    ),
    rows<{
      slug: string;
      round_type: string | null;
      amount_usd: number | null;
      announced_on: string;
    }>(
      db,
      sql`select slug, round_type, amount_usd, announced_on::text from funding_rounds
          where project_id = ${r.project_id} and id <> ${id} and merged_into_id is null and review_status <> 'rejected'
          order by announced_on desc`,
    ),
    rows<{
      slug: string;
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
      sql`select fr.slug, fr.round_type, fr.amount_usd, fr.announced_on::text, p.id as project_id,
            p.slug as project_slug, p.name as project_name, p.logo_url, p.category
          from funding_rounds fr join projects p on p.id = fr.project_id and p.merged_into_id is null
          where fr.id <> ${id} and fr.merged_into_id is null and fr.review_status <> 'rejected'
            and fr.project_id <> ${r.project_id}
            and fr.announced_on between ${r.announced_on}::date - 45 and ${r.announced_on}::date + 45
          order by (fr.round_type is not distinct from ${r.round_type}) desc,
            abs(fr.announced_on - ${r.announced_on}::date), fr.amount_usd desc nulls last
          limit 6`,
    ),
    rows<ChangeItem>(
      db,
      sql`select id, ${epoch('at')} as at, actor, action, summary from changes
          where subject_type = 'round' and subject_id = ${id} order by at desc limit 12`,
    ),
  ]);

  const ev = await evidenceFor(db, [
    { type: 'round', ids: [id] },
    { type: 'round_investor', ids: investorRows.map((i) => i.link_id) },
  ]);

  return {
    round: {
      id: r.id,
      slug: r.slug,
      roundType: r.round_type,
      amountUsd: r.amount_usd,
      valuationUsd: r.valuation_usd,
      announcedOn: r.announced_on,
      notes: r.notes,
      lockedFields: r.locked_fields ?? [],
      reviewStatus: r.review_status,
      checkedAt: r.checked_at,
      checkedBy: r.checked_by,
      updatedAt: r.updated_at,
    },
    project: {
      id: r.project_id,
      slug: r.project_slug,
      name: r.project_name,
      logoUrl: r.logo_url,
      category: r.category,
      tagline: r.tagline,
    },
    evidence: evidenceOf(ev, 'round', id),
    investors: investorRows.map((i) => ({
      linkId: i.link_id,
      party: {
        type: i.party_type,
        id: i.party_id,
        slug: i.slug,
        name: i.name,
        imageUrl: i.image_url,
      },
      isLead: i.is_lead,
      nameAsReported: i.name_as_reported,
      reviewStatus: i.review_status,
      evidence: evidenceOf(ev, 'round_investor', i.link_id),
    })),
    otherRounds: otherRows.map((o) => ({
      slug: o.slug,
      roundType: o.round_type,
      amountUsd: o.amount_usd,
      announcedOn: o.announced_on,
    })),
    nearby: nearbyRows.map((n) => ({
      slug: n.slug,
      roundType: n.round_type,
      amountUsd: n.amount_usd,
      announcedOn: n.announced_on,
      project: {
        id: n.project_id,
        slug: n.project_slug,
        name: n.project_name,
        logoUrl: n.logo_url,
        category: n.category,
      },
    })),
    changes: changeRows,
  };
}

// ---------------------------------------------------------------------------
// The fundraising list
// ---------------------------------------------------------------------------

export interface RoundRow {
  readonly id: number;
  readonly slug: string;
  readonly roundType: string | null;
  readonly amountUsd: number | null;
  readonly valuationUsd: number | null;
  readonly announcedOn: string;
  readonly project: ProjectRef & { tagline: string | null };
  readonly investors: readonly (PartyRef & { isLead: boolean })[];
  /** The strongest source for the round, for a one-click citation. */
  readonly source: { url: string; publisher: string | null; kind: string } | null;
  readonly sourceCount: number;
  readonly reviewStatus: ReviewStatus;
  readonly checkedAt: number | null;
}

export async function loadRounds(db: Executor): Promise<RoundRow[]> {
  const found = await rows<{
    id: number;
    slug: string;
    round_type: string | null;
    amount_usd: number | null;
    valuation_usd: number | null;
    announced_on: string;
    review_status: ReviewStatus;
    checked_at: number | null;
    project_id: number;
    project_slug: string;
    project_name: string;
    logo_url: string | null;
    category: string | null;
    tagline: string | null;
    investors: (PartyRef & { isLead: boolean })[] | null;
  }>(
    db,
    sql`
    with inv as (
      select ri.round_id, jsonb_agg(jsonb_build_object(
          'type', case when ri.organization_id is not null then 'organization' else 'person' end,
          'id', coalesce(o.id, pe.id), 'slug', coalesce(o.slug, pe.slug), 'name', coalesce(o.name, pe.name),
          'imageUrl', coalesce(o.logo_url, pe.avatar_url), 'isLead', ri.is_lead)
        order by ri.is_lead desc, coalesce(o.name, pe.name)) as items
      from round_investors ri
      left join organizations o on o.id = ri.organization_id
      left join people pe on pe.id = ri.person_id
      where ri.review_status <> 'rejected'
      group by ri.round_id
    )
    select fr.id, fr.slug, fr.round_type, fr.amount_usd, fr.valuation_usd, fr.announced_on::text, fr.review_status,
      ${epoch('fr.checked_at')} as checked_at, p.id as project_id, p.slug as project_slug, p.name as project_name,
      p.logo_url, p.category, p.tagline, inv.items as investors
    from funding_rounds fr
    join projects p on p.id = fr.project_id and p.merged_into_id is null and p.review_status <> 'rejected'
    left join inv on inv.round_id = fr.id
    where fr.merged_into_id is null and fr.review_status <> 'rejected'
    order by fr.announced_on desc, fr.id desc`,
  );

  const ev = await evidenceFor(db, [{ type: 'round', ids: found.map((r) => r.id) }]);
  return found.map((r) => {
    const sources = [
      ...new Map(evidenceOf(ev, 'round', r.id).map((e) => [e.sourceId, e])).values(),
    ].sort(rankEvidence);
    const best = sources[0];
    return {
      id: r.id,
      slug: r.slug,
      roundType: r.round_type,
      amountUsd: r.amount_usd,
      valuationUsd: r.valuation_usd,
      announcedOn: r.announced_on,
      project: {
        id: r.project_id,
        slug: r.project_slug,
        name: r.project_name,
        logoUrl: r.logo_url,
        category: r.category,
        tagline: r.tagline,
      },
      investors: r.investors ?? [],
      source: best ? { url: best.url, publisher: best.publisher, kind: best.kind } : null,
      sourceCount: sources.length,
      reviewStatus: r.review_status,
      checkedAt: r.checked_at,
    };
  });
}
