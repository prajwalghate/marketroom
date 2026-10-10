/**
 * Global search across projects, people, investors, tokens and programs.
 *
 * Ranked in SQL: an exact name first, then a name that starts with the query,
 * then a word in the name that does, then anything containing it — and within
 * each tier, the record that matters more (more value locked, more deals).
 * Mints and program addresses match by prefix, so a pasted address finds its
 * token or program.
 */

import { normalizeName } from '@marketroom/core';
import { sql } from 'drizzle-orm';
import { rows, type Executor } from '../client';

export type SearchType = 'project' | 'person' | 'investor' | 'token' | 'program';

export interface SearchHit {
  readonly type: SearchType;
  readonly key: string;
  readonly name: string;
  readonly imageUrl: string | null;
  readonly detail: string | null;
  readonly href: string;
  /** A project's category, or the category of the project a token belongs to. */
  readonly category?: string | null;
  /** A token's symbol, or a project's main token. */
  readonly symbol?: string | null;
  /** The latest recorded price and 24-hour change for that token. */
  readonly price?: number | null;
  readonly change24h?: number | null;
}

const like = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function search(
  db: Executor,
  query: string,
  options: { perType?: number; types?: readonly SearchType[] } = {},
): Promise<SearchHit[]> {
  const raw = query.trim();
  const q = normalizeName(raw);
  if (!q && raw.length < 3) return [];
  const perType = Math.min(options.perType ?? 6, 50);
  const want = new Set(options.types ?? ['project', 'person', 'investor', 'token', 'program']);
  const prefix = `${like(q)}%`;
  const word = `% ${like(q)}%`;
  const addr = `${like(raw)}%`;

  const tier = (expr: string) =>
    sql.raw(`case when ${expr} = '${q.replace(/'/g, "''")}' then 0
      when ${expr} like '${prefix.replace(/'/g, "''")}' then 1
      when ${expr} like '${word.replace(/'/g, "''")}' then 2 else 3 end`);

  const where = matchers(q, raw);
  const parts = [];
  if (want.has('project')) {
    parts.push(sql`
      (select 'project' as type, p.slug as key, p.name, p.logo_url as image_url,
        concat_ws(' · ', p.category, p.tagline) as detail, ${tier('lower(p.name)')} as tier,
        coalesce(m.tvl_solana, 0)::float8 as weight,
        p.category, tk.symbol, tk.price, tk.change_24h
      from projects p
      left join lateral (select tvl_solana from project_metrics m where m.project_id = p.id order by captured_at desc limit 1) m on true
      left join lateral (
        select t.symbol, s.price, s.change_24h from tokens t
        left join lateral (select price, change_24h from market_snapshots ms where ms.token_id = t.id order by captured_at desc limit 1) s on true
        where t.project_id = p.id and t.review_status <> 'rejected'
        order by t.is_primary desc, t.id limit 1
      ) tk on true
      where ${where.project}
      order by tier, weight desc limit ${perType})`);
  }
  if (want.has('person')) {
    parts.push(sql`
      (select 'person' as type, pe.slug as key, pe.name, pe.avatar_url as image_url,
        coalesce(pe.headline, (select pr.name || ' · ' || pp.role from project_people pp
          join projects pr on pr.id = pp.project_id where pp.person_id = pe.id and pp.review_status <> 'rejected'
          order by pp.is_current desc limit 1)) as detail,
        ${tier('lower(pe.name)')} as tier,
        (select count(*) from round_investors ri where ri.person_id = pe.id)::float8 as weight,
        null::text as category, null::text as symbol, null::float8 as price, null::float8 as change_24h
      from people pe
      where ${where.person}
      order by tier, weight desc limit ${perType})`);
  }
  if (want.has('investor')) {
    parts.push(sql`
      (select 'investor' as type, o.slug as key, o.name, o.logo_url as image_url,
        (select count(*)::int from round_investors ri where ri.organization_id = o.id)::text || ' deals' as detail,
        ${tier('lower(o.name)')} as tier,
        (select count(*) from round_investors ri where ri.organization_id = o.id)::float8 as weight,
        null::text as category, null::text as symbol, null::float8 as price, null::float8 as change_24h
      from organizations o
      where ${where.investor}
      order by tier, weight desc limit ${perType})`);
  }
  if (want.has('token')) {
    parts.push(sql`
      (select 'token' as type, t.mint as key, coalesce(t.symbol, t.mint) as name, t.logo_url as image_url,
        concat_ws(' · ', t.name, p.name) as detail,
        case when lower(t.symbol) = ${q} then 0 when t.mint like ${addr} then 0
          when lower(t.symbol) like ${prefix} then 1 else 3 end as tier,
        coalesce(s.market_cap, 0)::float8 as weight,
        p.category, t.symbol, s.price, s.change_24h
      from tokens t
      left join projects p on p.id = t.project_id
      left join lateral (select market_cap, price, change_24h from market_snapshots ms where ms.token_id = t.id order by captured_at desc limit 1) s on true
      where ${where.token}
      order by tier, weight desc limit ${perType})`);
  }
  if (want.has('program')) {
    parts.push(sql`
      (select 'program' as type, pg.address as key, coalesce(pg.name, pg.address) as name, null as image_url,
        concat_ws(' · ', pg.kind, (select string_agg(pr.name, ', ') from project_programs pp
          join projects pr on pr.id = pp.project_id where pp.program_id = pg.id and pp.review_status <> 'rejected')) as detail,
        case when pg.address like ${addr} then 0 when lower(coalesce(pg.name, '')) like ${prefix} then 1 else 3 end as tier,
        coalesce((select tx_per_hour from program_activity pa where pa.program_id = pg.id order by captured_at desc limit 1), 0)::float8 as weight,
        null::text as category, null::text as symbol, null::float8 as price, null::float8 as change_24h
      from programs pg
      where ${where.program}
      order by tier, weight desc limit ${perType})`);
  }
  if (parts.length === 0) return [];

  const found = await rows<{
    type: SearchType;
    key: string;
    name: string;
    image_url: string | null;
    detail: string | null;
    tier: number;
    weight: number;
    category: string | null;
    symbol: string | null;
    price: number | null;
    change_24h: number | null;
  }>(db, sql`select * from (${sql.join(parts, sql` union all `)}) hits order by tier, weight desc`);

  return found.map((h) => ({
    type: h.type,
    key: h.key,
    name: h.name,
    imageUrl: h.image_url,
    detail: h.detail || null,
    href: hrefFor(h.type, h.key),
    category: h.category,
    symbol: h.symbol,
    price: h.price === null ? null : Number(h.price),
    change24h: h.change_24h === null ? null : Number(h.change_24h),
  }));
}

/** How many records of each type match, for the counts on result tabs. */
export async function searchCounts(
  db: Executor,
  query: string,
): Promise<Record<SearchType, number>> {
  const raw = query.trim();
  const q = normalizeName(raw);
  const empty = { project: 0, person: 0, investor: 0, token: 0, program: 0 };
  if (!q && raw.length < 3) return empty;
  const where = matchers(q, raw);
  const found = await rows<{ type: SearchType; n: number }>(
    db,
    sql`select 'project' as type, count(*)::int as n from projects p where ${where.project}
        union all select 'person', count(*)::int from people pe where ${where.person}
        union all select 'investor', count(*)::int from organizations o where ${where.investor}
        union all select 'token', count(*)::int from tokens t where ${where.token}
        union all select 'program', count(*)::int from programs pg where ${where.program}`,
  );
  for (const r of found) empty[r.type] = Number(r.n);
  return empty;
}

/** The match condition for each record type, shared by results and counts. */
function matchers(q: string, raw: string) {
  const contains = `%${like(q)}%`;
  const addr = `${like(raw)}%`;
  const isAddress = /^[1-9A-HJ-NP-Za-km-z]{6,44}$/.test(raw);
  return {
    project: sql`p.merged_into_id is null and p.review_status <> 'rejected'
        and (lower(p.name) like ${contains} or exists (
          select 1 from aliases a where a.subject_type = 'project' and a.subject_id = p.id and a.alias like ${contains}))`,
    person: sql`pe.merged_into_id is null and pe.review_status <> 'rejected'
        and (lower(pe.name) like ${contains} or lower(coalesce(pe.github, '')) like ${contains}
          or lower(coalesce(pe.twitter, '')) like ${contains})`,
    investor: sql`o.merged_into_id is null and o.review_status <> 'rejected'
        and (lower(o.name) like ${contains} or exists (
          select 1 from aliases a where a.subject_type = 'organization' and a.subject_id = o.id and a.alias like ${contains}))`,
    token: sql`t.review_status <> 'rejected'
        and (lower(coalesce(t.symbol, '')) like ${contains} or lower(coalesce(t.name, '')) like ${contains}
          ${isAddress ? sql`or t.mint like ${addr}` : sql``})`,
    program: sql`pg.review_status <> 'rejected'
        and (lower(coalesce(pg.name, '')) like ${contains} ${isAddress ? sql`or pg.address like ${addr}` : sql``}
          or exists (select 1 from project_programs pp join projects pr on pr.id = pp.project_id
            where pp.program_id = pg.id and pp.review_status <> 'rejected' and lower(pr.name) like ${contains}))`,
  };
}

export function hrefFor(type: SearchType, key: string): string {
  switch (type) {
    case 'project':
      return `/projects/${key}`;
    case 'person':
      return `/people/${key}`;
    case 'investor':
      return `/investors/${key}`;
    case 'token':
      return `/tokens/${key}`;
    case 'program':
      return `/programs/${key}`;
  }
}
