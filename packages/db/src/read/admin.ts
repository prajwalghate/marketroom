/**
 * What the editors' dashboard reads: what needs checking, what is stale,
 * what looks duplicated, which sources are unreviewed or broken, and what
 * changed and who changed it.
 */

import { duplicatePairs, pairKey, type DuplicateReason } from '@marketroom/core';
import { desc, sql } from 'drizzle-orm';
import { rows, type Executor } from '../client';
import {
  importRuns,
  type ReviewStatus,
  type SourceKind,
  type SourceReview,
  type SubjectType,
} from '../schema';
import type { MergeType } from '../edit';
import { epoch, evidenceFor, evidenceOf, inList, type EvidenceRef } from './common';

const STALE_DAYS = 90;

export interface EntityCounts {
  readonly type: 'project' | 'person' | 'organization' | 'round' | 'token' | 'program' | 'event';
  readonly label: string;
  readonly total: number;
  readonly verified: number;
  readonly unreviewed: number;
  readonly needsReview: number;
  readonly stale: number;
}

const ENTITY_TABLES: [EntityCounts['type'], string, string][] = [
  ['project', 'projects', 'Projects'],
  ['person', 'people', 'People'],
  ['organization', 'organizations', 'Organisations'],
  ['round', 'funding_rounds', 'Funding rounds'],
  ['token', 'tokens', 'Tokens'],
  ['program', 'programs', 'Programs'],
  ['event', 'events', 'Events'],
];

export async function loadCounts(db: Executor): Promise<EntityCounts[]> {
  const out: EntityCounts[] = [];
  for (const [type, table, label] of ENTITY_TABLES) {
    const merged = ['projects', 'people', 'organizations', 'funding_rounds'].includes(table)
      ? sql`and merged_into_id is null`
      : sql``;
    const [c] = await rows<{
      total: number;
      verified: number;
      unreviewed: number;
      needs: number;
      stale: number;
    }>(
      db,
      sql`select count(*)::int as total,
            count(*) filter (where review_status = 'verified')::int as verified,
            count(*) filter (where review_status = 'unreviewed')::int as unreviewed,
            count(*) filter (where review_status = 'needs_review')::int as needs,
            count(*) filter (where review_status = 'verified' and checked_at < now() - make_interval(days => ${STALE_DAYS}))::int as stale
          from ${sql.identifier(table)} where review_status <> 'rejected' ${merged}`,
    );
    out.push({
      type,
      label,
      total: c?.total ?? 0,
      verified: c?.verified ?? 0,
      unreviewed: c?.unreviewed ?? 0,
      needsReview: c?.needs ?? 0,
      stale: c?.stale ?? 0,
    });
  }
  return out;
}

export async function loadLinkCounts(
  db: Executor,
): Promise<{ label: string; total: number; pending: number }[]> {
  const tables: [string, string][] = [
    ['event_links', 'Events ↔ records'],
    ['project_people', 'People ↔ projects'],
    ['organization_people', 'People ↔ organisations'],
    ['round_investors', 'Investors ↔ rounds'],
    ['project_programs', 'Projects ↔ programs'],
    ['news_mentions', 'News ↔ records'],
  ];
  const out = [];
  for (const [table, label] of tables) {
    // An event link its source states needs no review; only name matches do.
    const pendingOnly = table === 'event_links' ? sql`and matched_by is not null` : sql``;
    const [c] = await rows<{ total: number; pending: number }>(
      db,
      sql`select count(*) filter (where review_status <> 'rejected')::int as total,
            count(*) filter (where review_status in ('unreviewed', 'needs_review') ${pendingOnly})::int as pending
          from ${sql.identifier(table)}`,
    );
    out.push({ label, total: c?.total ?? 0, pending: c?.pending ?? 0 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

export type QueueKind =
  | 'person'
  | 'project_program'
  | 'project'
  | 'round'
  | 'organization'
  | 'project_person'
  | 'news_mention'
  | 'event_link'
  | 'event';

export interface QueueItem {
  readonly kind: QueueKind;
  readonly id: number;
  readonly title: string;
  readonly subtitle: string | null;
  readonly reason: string;
  readonly reviewStatus: ReviewStatus;
  readonly publicHref: string | null;
  readonly editHref: string;
  readonly createdAt: number;
}

export const QUEUE_KINDS: { kind: QueueKind; label: string; about: string }[] = [
  {
    kind: 'person',
    label: 'Guessed people',
    about: 'Investor names read as people from how they are written.',
  },
  {
    kind: 'project_program',
    label: 'Program mappings',
    about: 'Programs matched to projects by repository or name.',
  },
  {
    kind: 'project',
    label: 'Projects',
    about: 'Imported profiles nobody has checked, largest first.',
  },
  {
    kind: 'round',
    label: 'Funding rounds',
    about: 'Imported rounds nobody has checked against their announcement.',
  },
  {
    kind: 'organization',
    label: 'Investors',
    about: 'Investor organisations nobody has classified or checked.',
  },
  { kind: 'project_person', label: 'Team links', about: 'People linked to projects by an import.' },
  { kind: 'news_mention', label: 'News matches', about: 'News linked to records by name.' },
  {
    kind: 'event_link',
    label: 'Event matches',
    about: 'Events tied to a project or organisation by its name appearing in the event’s.',
  },
  { kind: 'event', label: 'Events', about: 'Imported events, upcoming first.' },
];

export async function loadQueue(
  db: Executor,
  kind: QueueKind,
  limit = 50,
  offset = 0,
): Promise<{ items: QueueItem[]; total: number }> {
  const pending = sql.raw(`review_status in ('unreviewed', 'needs_review')`);
  type Raw = {
    id: number;
    title: string;
    subtitle: string | null;
    reason: string | null;
    review_status: ReviewStatus;
    public_slug: string | null;
    created_at: number;
    total: number;
  };
  let found: Raw[] = [];
  switch (kind) {
    case 'person':
      found = await rows<Raw>(
        db,
        sql`select p.id, p.name as title, p.headline as subtitle, p.review_status, p.slug as public_slug,
              ${epoch('p.created_at')} as created_at, count(*) over ()::int as total,
              (select e.note from evidence e where e.subject_type = 'person' and e.subject_id = p.id and e.method = 'inferred' limit 1) as reason
            from people p where p.merged_into_id is null and p.${pending}
            order by (p.review_status = 'needs_review') desc,
              (select count(*) from round_investors ri where ri.person_id = p.id) desc, p.name
            limit ${limit} offset ${offset}`,
      );
      break;
    case 'project_program':
      found = await rows<Raw>(
        db,
        sql`select pp.id, pr.name || ' → ' || coalesce(pg.name, pg.address) as title, pg.address as subtitle,
              pp.review_status, pr.slug as public_slug, ${epoch('pp.created_at')} as created_at, count(*) over ()::int as total,
              (select e.note from evidence e where e.subject_type = 'project_program' and e.subject_id = pp.id
                order by (e.method = 'inferred') desc limit 1) as reason
            from project_programs pp join projects pr on pr.id = pp.project_id join programs pg on pg.id = pp.program_id
            where pp.${pending}
            order by (pp.review_status = 'needs_review') desc, pr.name limit ${limit} offset ${offset}`,
      );
      break;
    case 'project':
      found = await rows<Raw>(
        db,
        sql`select p.id, p.name as title, concat_ws(' · ', p.category, p.tagline) as subtitle, p.review_status,
              p.slug as public_slug, ${epoch('p.created_at')} as created_at, count(*) over ()::int as total,
              'Imported profile, not yet checked' as reason
            from projects p
            left join lateral (select tvl_solana from project_metrics m where m.project_id = p.id order by captured_at desc limit 1) m on true
            where p.merged_into_id is null and p.${pending}
            order by (p.review_status = 'needs_review') desc, m.tvl_solana desc nulls last limit ${limit} offset ${offset}`,
      );
      break;
    case 'round':
      found = await rows<Raw>(
        db,
        sql`select fr.id, p.name || ' — ' || coalesce(fr.round_type, 'round') as title,
              fr.announced_on::text || coalesce(' · $' || round((fr.amount_usd / 1e6)::numeric, 1)::text || 'M', ' · undisclosed') as subtitle,
              fr.review_status, fr.slug as public_slug, ${epoch('fr.created_at')} as created_at, count(*) over ()::int as total,
              'Imported round — check it against its announcement' as reason
            from funding_rounds fr join projects p on p.id = fr.project_id
            where fr.merged_into_id is null and fr.${pending}
            order by fr.announced_on desc limit ${limit} offset ${offset}`,
      );
      break;
    case 'organization':
      found = await rows<Raw>(
        db,
        sql`select o.id, o.name as title, coalesce(o.kind, 'unclassified') as subtitle, o.review_status,
              o.slug as public_slug, ${epoch('o.created_at')} as created_at, count(*) over ()::int as total,
              (select count(*) from round_investors ri where ri.organization_id = o.id)::text || ' deals on record' as reason
            from organizations o where o.merged_into_id is null and o.${pending}
            order by (select count(*) from round_investors ri where ri.organization_id = o.id) desc
            limit ${limit} offset ${offset}`,
      );
      break;
    case 'project_person':
      found = await rows<Raw>(
        db,
        sql`select pp.id, pe.name || ' — ' || pp.role as title, pr.name as subtitle, pp.review_status,
              pr.slug as public_slug, ${epoch('pp.created_at')} as created_at, count(*) over ()::int as total,
              (select e.note from evidence e where e.subject_type = 'project_person' and e.subject_id = pp.id limit 1) as reason
            from project_people pp join people pe on pe.id = pp.person_id join projects pr on pr.id = pp.project_id
            where pp.${pending} order by pr.name, pe.name limit ${limit} offset ${offset}`,
      );
      break;
    case 'news_mention':
      found = await rows<Raw>(
        db,
        sql`select m.id, n.title, coalesce(p.name, pe.name, o.name) || ' · matched in ' || m.matched_by as subtitle,
              m.review_status, coalesce(p.slug, pe.slug, o.slug) as public_slug, ${epoch('n.published_at')} as created_at,
              count(*) over ()::int as total, n.publisher as reason
            from news_mentions m join news n on n.id = m.news_id
            left join projects p on m.subject_type = 'project' and p.id = m.subject_id
            left join people pe on m.subject_type = 'person' and pe.id = m.subject_id
            left join organizations o on m.subject_type = 'organization' and o.id = m.subject_id
            where m.${pending} order by n.published_at desc limit ${limit} offset ${offset}`,
      );
      break;
    case 'event_link':
      found = await rows<Raw>(
        db,
        sql`select l.id, e.title, coalesce(p.name, o.name) || ' · ' || e.starts_on::text as subtitle, l.review_status,
              coalesce(p.slug, o.slug) as public_slug, ${epoch('l.created_at')} as created_at, count(*) over ()::int as total,
              'Matched by name in the event title' as reason
            from event_links l join events e on e.id = l.event_id
            left join projects p on l.subject_type = 'project' and p.id = l.subject_id
            left join organizations o on l.subject_type = 'organization' and o.id = l.subject_id
            where l.${pending} and l.matched_by is not null
            order by e.starts_on desc limit ${limit} offset ${offset}`,
      );
      break;
    case 'event':
      found = await rows<Raw>(
        db,
        sql`select e.id, e.title, e.starts_on::text || ' · ' || e.kind as subtitle, e.review_status,
              e.slug as public_slug, ${epoch('e.created_at')} as created_at, count(*) over ()::int as total,
              'Imported event' as reason
            from events e where e.${pending}
            order by (e.starts_on >= current_date) desc, abs(e.starts_on - current_date) limit ${limit} offset ${offset}`,
      );
      break;
  }
  const publicHref = (slug: string | null): string | null => {
    if (!slug) return null;
    switch (kind) {
      case 'person':
        return `/people/${slug}`;
      case 'organization':
        return `/investors/${slug}`;
      case 'round':
        return `/rounds/${slug}`;
      case 'event':
        return `/calendar`;
      default:
        return `/projects/${slug}`;
    }
  };
  return {
    total: found[0]?.total ?? 0,
    items: found.map((r) => ({
      kind,
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      reason: r.reason ?? '',
      reviewStatus: r.review_status,
      publicHref: publicHref(r.public_slug),
      editHref: editHrefFor(kind, r.id),
      createdAt: r.created_at,
    })),
  };
}

export function editHrefFor(kind: QueueKind | SubjectType, id: number): string {
  switch (kind) {
    case 'project':
      return `/admin/edit/project/${id}`;
    case 'person':
      return `/admin/edit/person/${id}`;
    case 'organization':
      return `/admin/edit/organization/${id}`;
    case 'round':
      return `/admin/edit/round/${id}`;
    case 'token':
      return `/admin/edit/token/${id}`;
    case 'program':
      return `/admin/edit/program/${id}`;
    case 'event':
      return `/admin/edit/event/${id}`;
    default:
      return `/admin/review?kind=${kind}#item-${id}`;
  }
}

// ---------------------------------------------------------------------------
// Stale profiles
// ---------------------------------------------------------------------------

export interface StaleItem {
  readonly type: 'project' | 'person' | 'organization';
  readonly id: number;
  readonly name: string;
  readonly slug: string;
  readonly checkedAt: number | null;
  readonly checkedBy: string | null;
  readonly changedSince: number;
}

/** Checked profiles that are now old, and checked profiles whose connections changed since. */
export async function loadStale(db: Executor, limit = 60): Promise<StaleItem[]> {
  return rows<StaleItem>(
    db,
    sql`
    select * from (
      select 'project' as type, p.id, p.name, p.slug, ${epoch('p.checked_at')} as "checkedAt", p.checked_by as "checkedBy",
        (select count(*) from changes c where c.at > p.checked_at and (
          (c.subject_type = 'project' and c.subject_id = p.id) or
          (c.subject_type = 'round' and c.subject_id in (select id from funding_rounds where project_id = p.id))
        ) and c.actor like 'import:%')::int as "changedSince"
      from projects p where p.merged_into_id is null and p.review_status = 'verified'
      union all
      select 'organization', o.id, o.name, o.slug, ${epoch('o.checked_at')}, o.checked_by,
        (select count(*) from changes c where c.at > o.checked_at and c.subject_type = 'organization' and c.subject_id = o.id)::int
      from organizations o where o.merged_into_id is null and o.review_status = 'verified'
      union all
      select 'person', pe.id, pe.name, pe.slug, ${epoch('pe.checked_at')}, pe.checked_by,
        (select count(*) from changes c where c.at > pe.checked_at and c.subject_type = 'person' and c.subject_id = pe.id)::int
      from people pe where pe.merged_into_id is null and pe.review_status = 'verified'
    ) s
    where "checkedAt" < (extract(epoch from now() - make_interval(days => ${STALE_DAYS})) * 1000) or "changedSince" > 0
    order by "changedSince" desc, "checkedAt" asc nulls first
    limit ${limit}`,
  );
}

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

export interface DuplicateCandidate {
  readonly type: MergeType;
  readonly reasons: readonly DuplicateReason[];
  readonly a: DuplicateSide;
  readonly b: DuplicateSide;
}

export interface DuplicateSide {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly detail: string;
  readonly links: number;
  readonly reviewStatus: ReviewStatus;
}

export async function loadDuplicates(
  db: Executor,
  type: MergeType,
  limit = 60,
): Promise<DuplicateCandidate[]> {
  type Raw = {
    id: number;
    slug: string;
    name: string;
    website: string | null;
    twitter: string | null;
    detail: string | null;
    links: number;
    review_status: ReviewStatus;
  };
  let found: Raw[];
  if (type === 'project') {
    found = await rows<Raw>(
      db,
      sql`select id, slug, name, website, twitter, category as detail, review_status,
            ((select count(*) from funding_rounds f where f.project_id = p.id) +
             (select count(*) from project_people pp where pp.project_id = p.id) +
             (select count(*) from tokens t where t.project_id = p.id))::int as links
          from projects p where merged_into_id is null and review_status <> 'rejected'`,
    );
  } else if (type === 'organization') {
    found = await rows<Raw>(
      db,
      sql`select id, slug, name, website, twitter, coalesce(kind, 'unclassified') as detail, review_status,
            (select count(*) from round_investors ri where ri.organization_id = o.id)::int as links
          from organizations o where merged_into_id is null and review_status <> 'rejected'`,
    );
  } else if (type === 'person') {
    found = await rows<Raw>(
      db,
      sql`select id, slug, name, website, twitter, headline as detail, review_status,
            ((select count(*) from round_investors ri where ri.person_id = pe.id) +
             (select count(*) from project_people pp where pp.person_id = pe.id))::int as links
          from people pe where merged_into_id is null and review_status <> 'rejected'`,
    );
  } else {
    // Rounds: the same project, the same month, and the same type or amount.
    const pairs = await rows<{
      a: number;
      b: number;
      a_slug: string;
      b_slug: string;
      a_name: string;
      b_name: string;
      a_detail: string;
      b_detail: string;
      a_links: number;
      b_links: number;
      a_status: ReviewStatus;
      b_status: ReviewStatus;
    }>(
      db,
      sql`select x.id as a, y.id as b, x.slug as a_slug, y.slug as b_slug,
            p.name || ' — ' || coalesce(x.round_type, 'round') as a_name, p.name || ' — ' || coalesce(y.round_type, 'round') as b_name,
            x.announced_on::text || coalesce(' · $' || x.amount_usd::bigint::text, '') as a_detail,
            y.announced_on::text || coalesce(' · $' || y.amount_usd::bigint::text, '') as b_detail,
            (select count(*) from round_investors ri where ri.round_id = x.id)::int as a_links,
            (select count(*) from round_investors ri where ri.round_id = y.id)::int as b_links,
            x.review_status as a_status, y.review_status as b_status
          from funding_rounds x
          join funding_rounds y on y.project_id = x.project_id and y.id > x.id
            and abs(y.announced_on - x.announced_on) <= 45
            and (y.round_type is not distinct from x.round_type or y.amount_usd = x.amount_usd)
          join projects p on p.id = x.project_id
          where x.merged_into_id is null and y.merged_into_id is null
            and x.review_status <> 'rejected' and y.review_status <> 'rejected'
            and not exists (select 1 from distinct_pairs d where d.subject_type = 'round' and d.a_id = x.id and d.b_id = y.id)
          limit ${limit}`,
    );
    return pairs.map((r) => ({
      type,
      reasons: ['similar name'],
      a: {
        id: r.a,
        slug: r.a_slug,
        name: r.a_name,
        detail: r.a_detail,
        links: r.a_links,
        reviewStatus: r.a_status,
      },
      b: {
        id: r.b,
        slug: r.b_slug,
        name: r.b_name,
        detail: r.b_detail,
        links: r.b_links,
        reviewStatus: r.b_status,
      },
    }));
  }

  const dismissed = new Set(
    (
      await rows<{ a_id: number; b_id: number }>(
        db,
        sql`select a_id, b_id from distinct_pairs where subject_type = ${type}`,
      )
    ).map((d) => pairKey(d.a_id, d.b_id)),
  );
  const byId = new Map(found.map((r) => [r.id, r]));
  const side = (r: Raw): DuplicateSide => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    detail: r.detail ?? '',
    links: r.links,
    reviewStatus: r.review_status,
  });
  return duplicatePairs(
    found.map((r) => ({ id: r.id, name: r.name, website: r.website, twitter: r.twitter })),
    dismissed,
  )
    .slice(0, limit)
    .map((p) => ({ type, reasons: p.reasons, a: side(byId.get(p.a)!), b: side(byId.get(p.b)!) }));
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export interface SourceRow {
  readonly id: number;
  readonly url: string;
  readonly title: string | null;
  readonly publisher: string | null;
  readonly kind: SourceKind;
  readonly reviewStatus: SourceReview;
  readonly httpStatus: number | null;
  readonly linkCheckedAt: number | null;
  readonly firstSeenAt: number;
  readonly uses: number;
  readonly subjects: readonly string[];
  readonly reviewedBy: string | null;
  readonly notes: string | null;
}

export async function loadSources(
  db: Executor,
  filters: { status?: string; kind?: string; q?: string; page?: number },
  pageSize = 50,
): Promise<{ rows: SourceRow[]; total: number; kinds: { kind: string; count: number }[] }> {
  const where = [sql`true`];
  if (filters.status) where.push(sql`s.review_status = ${filters.status}`);
  if (filters.kind) where.push(sql`s.kind = ${filters.kind}`);
  if (filters.q)
    where.push(
      sql`(s.url ilike ${`%${filters.q}%`} or s.title ilike ${`%${filters.q}%`} or s.publisher ilike ${`%${filters.q}%`})`,
    );
  const page = Math.max(1, filters.page ?? 1);
  const found = await rows<{
    id: number;
    url: string;
    title: string | null;
    publisher: string | null;
    kind: SourceKind;
    review_status: SourceReview;
    http_status: number | null;
    link_checked_at: number | null;
    first_seen_at: number;
    uses: number;
    subjects: string[] | null;
    reviewed_by: string | null;
    notes: string | null;
    total: number;
  }>(
    db,
    sql`select s.id, s.url, s.title, s.publisher, s.kind, s.review_status, s.http_status,
          ${epoch('s.link_checked_at')} as link_checked_at, ${epoch('s.first_seen_at')} as first_seen_at,
          s.reviewed_by, s.notes, count(*) over ()::int as total,
          (select count(*) from evidence e where e.source_id = s.id)::int as uses,
          (select array_agg(distinct e.subject_type) from evidence e where e.source_id = s.id) as subjects
        from sources s where ${sql.join(where, sql` and `)}
        order by (s.review_status = 'broken') desc, (s.review_status = 'unreviewed') desc,
          (select count(*) from evidence e where e.source_id = s.id) desc, s.id desc
        limit ${pageSize} offset ${(page - 1) * pageSize}`,
  );
  const kinds = await rows<{ kind: string; count: number }>(
    db,
    sql`select kind, count(*)::int as count from sources group by kind order by count desc`,
  );
  return {
    total: found[0]?.total ?? 0,
    kinds,
    rows: found.map((r) => ({
      id: r.id,
      url: r.url,
      title: r.title,
      publisher: r.publisher,
      kind: r.kind,
      reviewStatus: r.review_status,
      httpStatus: r.http_status,
      linkCheckedAt: r.link_checked_at,
      firstSeenAt: r.first_seen_at,
      uses: r.uses,
      subjects: r.subjects ?? [],
      reviewedBy: r.reviewed_by,
      notes: r.notes,
    })),
  };
}

/** Facts one source supports, for the source detail view. */
export async function loadSourceUses(db: Executor, sourceId: number) {
  return rows<{
    subject_type: SubjectType;
    subject_id: number;
    field: string;
    method: string;
    checked_at: number;
    checked_by: string;
    note: string | null;
    label: string | null;
  }>(
    db,
    sql`select e.subject_type, e.subject_id, e.field, e.method, ${epoch('e.checked_at')} as checked_at, e.checked_by, e.note,
          case e.subject_type
            when 'project' then (select name from projects where id = e.subject_id)
            when 'person' then (select name from people where id = e.subject_id)
            when 'organization' then (select name from organizations where id = e.subject_id)
            when 'round' then (select p.name || ' — ' || coalesce(f.round_type, 'round') from funding_rounds f join projects p on p.id = f.project_id where f.id = e.subject_id)
            when 'token' then (select coalesce(symbol, mint) from tokens where id = e.subject_id)
            when 'program' then (select coalesce(name, address) from programs where id = e.subject_id)
            when 'event' then (select title from events where id = e.subject_id)
            when 'round_investor' then (select coalesce(o.name, pe.name) || ' in ' || p.name from round_investors ri
              left join organizations o on o.id = ri.organization_id left join people pe on pe.id = ri.person_id
              join funding_rounds f on f.id = ri.round_id join projects p on p.id = f.project_id where ri.id = e.subject_id)
            when 'project_person' then (select pe.name || ' at ' || p.name from project_people pp join people pe on pe.id = pp.person_id
              join projects p on p.id = pp.project_id where pp.id = e.subject_id)
            when 'project_program' then (select p.name || ' ↔ ' || coalesce(pg.name, pg.address) from project_programs pp
              join projects p on p.id = pp.project_id join programs pg on pg.id = pp.program_id where pp.id = e.subject_id)
            else null end as label
        from evidence e where e.source_id = ${sourceId} order by e.checked_at desc limit 200`,
  );
}

// ---------------------------------------------------------------------------
// Change log
// ---------------------------------------------------------------------------

export interface ChangeRow {
  readonly id: number;
  readonly at: number;
  readonly actor: string;
  readonly action: string;
  readonly subjectType: SubjectType | null;
  readonly subjectId: number | null;
  readonly summary: string;
  readonly diff: Record<string, { from: unknown; to: unknown }> | null;
}

export async function loadChangeLog(
  db: Executor,
  filters: {
    actor?: string;
    editorsOnly?: boolean;
    page?: number;
    subjectType?: string;
    subjectId?: number;
  },
  pageSize = 60,
): Promise<{ rows: ChangeRow[]; total: number }> {
  const where = [sql`true`];
  if (filters.editorsOnly) where.push(sql`actor not like 'import:%'`);
  if (filters.actor) where.push(sql`actor = ${filters.actor}`);
  if (filters.subjectType) where.push(sql`subject_type = ${filters.subjectType}`);
  if (filters.subjectId) where.push(sql`subject_id = ${filters.subjectId}`);
  const page = Math.max(1, filters.page ?? 1);
  const found = await rows<{
    id: number;
    at: number;
    actor: string;
    action: string;
    subject_type: SubjectType | null;
    subject_id: number | null;
    summary: string;
    diff: ChangeRow['diff'];
    total: number;
  }>(
    db,
    sql`select id, ${epoch('at')} as at, actor, action, subject_type, subject_id, summary, diff,
          count(*) over ()::int as total
        from changes where ${sql.join(where, sql` and `)}
        order by at desc, id desc limit ${pageSize} offset ${(page - 1) * pageSize}`,
  );
  return {
    total: found[0]?.total ?? 0,
    rows: found.map((r) => ({
      id: r.id,
      at: r.at,
      actor: r.actor,
      action: r.action,
      subjectType: r.subject_type,
      subjectId: r.subject_id,
      summary: r.summary,
      diff: r.diff,
    })),
  };
}

/** Names for a set of subjects, for linking change-log rows. */
export async function subjectNames(
  db: Executor,
  subjects: readonly { type: SubjectType; id: number }[],
): Promise<Map<string, { name: string; href: string | null }>> {
  const out = new Map<string, { name: string; href: string | null }>();
  const group = (t: SubjectType) => [
    ...new Set(subjects.filter((s) => s.type === t).map((s) => s.id)),
  ];
  const load = async (t: SubjectType, table: string, nameExpr: string, prefix: string | null) => {
    const ids = group(t);
    if (!ids.length) return;
    const found = await rows<{ id: number; name: string; slug: string | null }>(
      db,
      sql`select id, ${sql.raw(nameExpr)} as name, ${sql.raw(prefix ? 'slug' : 'null')} as slug
          from ${sql.identifier(table)} where id in ${inList(ids)}`,
    );
    for (const f of found)
      out.set(`${t}:${f.id}`, {
        name: f.name,
        href: prefix && f.slug ? `${prefix}${f.slug}` : null,
      });
  };
  await load('project', 'projects', 'name', '/projects/');
  await load('person', 'people', 'name', '/people/');
  await load('organization', 'organizations', 'name', '/investors/');
  await load(
    'round',
    'funding_rounds',
    "coalesce(round_type, 'Round') || ' ' || announced_on::text",
    '/rounds/',
  );
  await load('event', 'events', 'title', null);
  return out;
}

// ---------------------------------------------------------------------------
// Editable records
// ---------------------------------------------------------------------------

const EDIT_TABLE: Record<string, string> = {
  project: 'projects',
  person: 'people',
  organization: 'organizations',
  round: 'funding_rounds',
  token: 'tokens',
  program: 'programs',
  event: 'events',
};

/**
 * A record exactly as stored — every column, camel-cased — with all of its
 * evidence, for the edit form. Dates come back as ISO strings.
 */
export async function loadEditable(
  db: Executor,
  type: keyof typeof EDIT_TABLE,
  id: number,
): Promise<{ record: Record<string, unknown>; evidence: EvidenceRef[] } | null> {
  const table = EDIT_TABLE[type];
  if (!table) return null;
  const [raw] = await rows<Record<string, unknown>>(
    db,
    sql`select to_jsonb(t) as row from ${sql.identifier(table)} t where id = ${id}`,
  );
  const row = (raw as { row?: Record<string, unknown> } | undefined)?.row;
  if (!row) return null;
  const record = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()),
      v,
    ]),
  );
  const ev = await evidenceFor(db, [{ type: type as SubjectType, ids: [id] }]);
  return { record, evidence: evidenceOf(ev, type as SubjectType, id) };
}

/** Names for pickers: every live project, person and organisation. */
export async function loadPickers(db: Executor) {
  const [projectList, peopleList, orgList] = await Promise.all([
    rows<{ id: number; name: string; slug: string }>(
      db,
      sql`select id, name, slug from projects where merged_into_id is null and review_status <> 'rejected' order by lower(name)`,
    ),
    rows<{ id: number; name: string; slug: string }>(
      db,
      sql`select id, name, slug from people where merged_into_id is null and review_status <> 'rejected' order by lower(name)`,
    ),
    rows<{ id: number; name: string; slug: string }>(
      db,
      sql`select id, name, slug from organizations where merged_into_id is null and review_status <> 'rejected' order by lower(name)`,
    ),
  ]);
  return { projects: projectList, people: peopleList, organizations: orgList };
}

/** The latest import runs, newest first. */
export async function importRunsOf(db: Executor, limit = 200) {
  return db.select().from(importRuns).orderBy(desc(importRuns.startedAt)).limit(limit);
}

/** One source, with the same shape as the sources list. */
export async function loadSource(db: Executor, id: number): Promise<SourceRow | null> {
  const [s] = await rows<{
    id: number;
    url: string;
    title: string | null;
    publisher: string | null;
    kind: SourceKind;
    review_status: SourceReview;
    http_status: number | null;
    link_checked_at: number | null;
    first_seen_at: number;
    reviewed_by: string | null;
    notes: string | null;
    uses: number;
  }>(
    db,
    sql`select s.id, s.url, s.title, s.publisher, s.kind, s.review_status, s.http_status,
          ${epoch('s.link_checked_at')} as link_checked_at, ${epoch('s.first_seen_at')} as first_seen_at,
          s.reviewed_by, s.notes, (select count(*) from evidence e where e.source_id = s.id)::int as uses
        from sources s where s.id = ${id}`,
  );
  return s
    ? {
        id: s.id,
        url: s.url,
        title: s.title,
        publisher: s.publisher,
        kind: s.kind,
        reviewStatus: s.review_status,
        httpStatus: s.http_status,
        linkCheckedAt: s.link_checked_at,
        firstSeenAt: s.first_seen_at,
        uses: s.uses,
        subjects: [],
        reviewedBy: s.reviewed_by,
        notes: s.notes,
      }
    : null;
}

/** Record counts and the time of the last successful import, for freshness lines. */
export async function loadImportCounts(db: Executor) {
  const [c] = await rows<{
    projects: number;
    rounds: number;
    people: number;
    programs: number;
    news: number;
    events: number;
    last: number | null;
  }>(
    db,
    sql`select
      (select count(*)::int from projects where merged_into_id is null) as projects,
      (select count(*)::int from funding_rounds where merged_into_id is null) as rounds,
      (select count(*)::int from people where merged_into_id is null) as people,
      (select count(*)::int from programs) as programs,
      (select count(*)::int from news) as news,
      (select count(*)::int from events) as events,
      (select (extract(epoch from max(finished_at)) * 1000)::float8 from import_runs where status in ('ok', 'partial')) as last`,
  );
  return {
    projects: c?.projects ?? 0,
    rounds: c?.rounds ?? 0,
    people: c?.people ?? 0,
    programs: c?.programs ?? 0,
    news: c?.news ?? 0,
    events: c?.events ?? 0,
    lastImportAt: c?.last ?? null,
  };
}
