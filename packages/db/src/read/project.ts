/**
 * One project, with everything connected to it.
 *
 * The profile is assembled from separate records — the project, its people,
 * its rounds and their investors, its programs, tokens, news and events — and
 * every connection carries its own evidence, so the page can say not just
 * *what* but *according to whom, checked when*.
 */

import { activityLevel, normalizeName, toSlug, type ActivityLevel } from '@marketroom/core';
import { sql } from 'drizzle-orm';
import { rows, type Executor } from '../client';
import type { ProjectStatus, ProgramRelation, ReviewStatus } from '../schema';
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

export interface ProjectRecord extends Curation {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly tagline: string | null;
  readonly description: string | null;
  readonly logoUrl: string | null;
  readonly category: string | null;
  readonly tags: readonly string[];
  readonly status: ProjectStatus | null;
  readonly foundedYear: number | null;
  readonly website: string | null;
  readonly twitter: string | null;
  readonly githubOrgs: readonly string[];
  readonly discord: string | null;
  readonly telegram: string | null;
  readonly docs: string | null;
  readonly coingeckoId: string | null;
  readonly defillamaKey: string | null;
  readonly defillamaSlugs: readonly string[];
  readonly lockedFields: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface TeamMember {
  readonly linkId: number;
  readonly person: PersonRef;
  readonly role: string;
  readonly isCurrent: boolean;
  readonly startedOn: string | null;
  readonly endedOn: string | null;
  readonly reviewStatus: ReviewStatus;
  readonly checkedAt: number | null;
  readonly evidence: readonly EvidenceRef[];
}

export interface RoundInvestor {
  readonly linkId: number;
  readonly party: PartyRef;
  readonly isLead: boolean;
  readonly nameAsReported: string | null;
  readonly reviewStatus: ReviewStatus;
  readonly evidence: readonly EvidenceRef[];
}

export interface RoundSummary extends Curation {
  readonly id: number;
  readonly slug: string;
  readonly roundType: string | null;
  readonly amountUsd: number | null;
  readonly valuationUsd: number | null;
  readonly announcedOn: string;
  readonly investors: readonly RoundInvestor[];
  readonly evidence: readonly EvidenceRef[];
}

export interface ProjectInvestor {
  readonly party: PartyRef;
  readonly kind: string | null;
  readonly isLead: boolean;
  readonly rounds: readonly {
    slug: string;
    roundType: string | null;
    announcedOn: string;
    isLead: boolean;
  }[];
}

export interface ActivitySnapshot {
  readonly txPerHour: number | null;
  readonly failedShare: number | null;
  readonly latestTxAt: number | null;
  readonly sampleSize: number;
  readonly windowSeconds: number | null;
  readonly capturedAt: number;
  readonly provider: string;
  readonly method: string;
  readonly level: ActivityLevel;
}

export interface ProgramLink {
  readonly linkId: number;
  readonly relation: ProgramRelation;
  readonly note: string | null;
  readonly reviewStatus: ReviewStatus;
  readonly evidence: readonly EvidenceRef[];
  readonly program: ProgramFacts;
  readonly activity: ActivitySnapshot | null;
  /** Estimated transactions per hour at each reading over the last two weeks, oldest first. */
  readonly history: readonly { t: number; v: number }[];
}

export interface ProgramFacts {
  readonly id: number;
  readonly address: string;
  readonly name: string | null;
  readonly kind: string | null;
  readonly loader: string | null;
  readonly upgradeAuthority: string | null;
  readonly lastDeploySlot: number | null;
  readonly onchainCheckedAt: number | null;
  readonly verifiedBuild: boolean | null;
  readonly verifiedRepo: string | null;
  readonly verifiedAt: number | null;
  readonly evidence: readonly EvidenceRef[];
}

export interface MarketSnapshot {
  readonly price: number | null;
  readonly marketCap: number | null;
  readonly fdv: number | null;
  readonly volume24h: number | null;
  readonly liquidity: number | null;
  readonly holders: number | null;
  readonly change24h: number | null;
  readonly provider: string;
  readonly providerUpdatedAt: number | null;
  readonly capturedAt: number;
}

export interface TokenLink extends Curation {
  readonly id: number;
  readonly mint: string;
  readonly symbol: string | null;
  readonly name: string | null;
  readonly logoUrl: string | null;
  readonly standard: string | null;
  readonly decimals: number | null;
  readonly isPrimary: boolean;
  readonly launchedAt: number | null;
  readonly market: MarketSnapshot | null;
  readonly evidence: readonly EvidenceRef[];
}

export interface ProjectMetricsView {
  readonly tvlSolana: number | null;
  readonly tvlTotal: number | null;
  readonly tvlChange1d: number | null;
  readonly tvlChange7d: number | null;
  readonly fees30d: number | null;
  readonly revenue30d: number | null;
  readonly products: readonly { name: string; category: string | null; tvl: number | null }[];
  readonly provider: string;
  readonly capturedAt: number;
}

export interface NewsItem {
  readonly id: number;
  readonly url: string;
  readonly title: string;
  readonly publisher: string;
  readonly publishedAt: number;
  readonly summary: string | null;
  readonly matchedBy: string;
  readonly reviewStatus: ReviewStatus;
}

export interface EventItem {
  readonly id: number;
  readonly slug: string;
  readonly kind: string;
  readonly title: string;
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly url: string | null;
  readonly location: string | null;
  readonly amountUsd: number | null;
  readonly reviewStatus: ReviewStatus;
  /** How the event was tied to this project: `null` by its source, `name` by matching. */
  readonly linkMatchedBy: string | null;
  readonly linkReviewStatus: ReviewStatus;
  readonly evidence: readonly EvidenceRef[];
}

/** One source and every fact on the page it supports. */
export interface SourceUse {
  readonly source: Omit<
    EvidenceRef,
    'id' | 'field' | 'method' | 'checkedAt' | 'checkedBy' | 'note'
  >;
  readonly supports: readonly {
    label: string;
    method: string;
    checkedAt: number;
    checkedBy: string;
  }[];
  readonly lastChecked: number;
}

export interface ChangeItem {
  readonly id: number;
  readonly at: number;
  readonly actor: string;
  readonly action: string;
  readonly summary: string;
}

export interface ProjectProfile {
  readonly project: ProjectRecord;
  readonly evidence: readonly EvidenceRef[];
  readonly parent: ProjectRef | null;
  readonly children: readonly ProjectRef[];
  readonly team: readonly TeamMember[];
  readonly rounds: readonly RoundSummary[];
  readonly investors: readonly ProjectInvestor[];
  readonly programs: readonly ProgramLink[];
  readonly tokens: readonly TokenLink[];
  readonly metrics: ProjectMetricsView | null;
  readonly news: readonly NewsItem[];
  readonly events: readonly EventItem[];
  readonly sources: readonly SourceUse[];
  readonly similar: readonly (ProjectRef & { tvlSolana: number | null; tagline: string | null })[];
  readonly changes: readonly ChangeItem[];
}

export type Lookup<T> =
  { kind: 'found'; value: T } | { kind: 'redirect'; slug: string } | { kind: 'missing' };

const ms = (v: number | null) => v;

/**
 * Find a project by slug. A merged project redirects to the one it was merged
 * into; a name typed as a slug ("kamino") redirects to the project it names.
 */
export async function findProjectId(db: Executor, slug: string): Promise<Lookup<number>> {
  const [hit] = await rows<{ id: number; merged_into_id: number | null; review_status: string }>(
    db,
    sql`select id, merged_into_id, review_status from projects where slug = ${slug}`,
  );
  if (hit && !hit.merged_into_id && hit.review_status !== 'rejected')
    return { kind: 'found', value: hit.id };
  // A DefiLlama slug — the project's or one of its products' — names it too.
  const bySource = hit
    ? undefined
    : (
        await rows<{ id: number }>(
          db,
          sql`select id from projects where (defillama_key = ${slug} or ${slug} = any(defillama_slugs))
              and merged_into_id is null and review_status <> 'rejected' limit 1`,
        )
      )[0]?.id;
  const target = hit?.merged_into_id
    ? hit.merged_into_id
    : (bySource ??
      (
        await rows<{ subject_id: number }>(
          db,
          sql`select subject_id from aliases where subject_type = 'project' and alias = ${normalizeName(slug.replace(/-/g, ' '))} limit 1`,
        )
      )[0]?.subject_id);
  if (!target) return { kind: 'missing' };
  const [winner] = await rows<{ slug: string; merged_into_id: number | null }>(
    db,
    sql`select slug, merged_into_id from projects where id = ${target}`,
  );
  if (!winner || winner.slug === slug) return { kind: 'missing' };
  return { kind: 'redirect', slug: winner.slug };
}

export async function loadProjectProfile(
  db: Executor,
  id: number,
  now = Date.now(),
): Promise<ProjectProfile | null> {
  const [p] = await rows<{
    id: number;
    slug: string;
    name: string;
    tagline: string | null;
    description: string | null;
    logo_url: string | null;
    category: string | null;
    tags: string[];
    status: ProjectStatus | null;
    founded_year: number | null;
    website: string | null;
    twitter: string | null;
    github_orgs: string[];
    discord: string | null;
    telegram: string | null;
    docs: string | null;
    coingecko_id: string | null;
    defillama_key: string | null;
    defillama_slugs: string[];
    parent_id: number | null;
    review_status: ReviewStatus;
    checked_at: number | null;
    checked_by: string | null;
    locked_fields: string[];
    created_at: number;
    updated_at: number;
  }>(
    db,
    sql`select id, slug, name, tagline, description, logo_url, category, tags, status, founded_year,
          website, twitter, github_orgs, discord, telegram, docs, coingecko_id, defillama_key,
          defillama_slugs, parent_id, review_status, checked_by, locked_fields,
          ${epoch('checked_at')} as checked_at, ${epoch('created_at')} as created_at,
          ${epoch('updated_at')} as updated_at
        from projects where id = ${id}`,
  );
  if (!p) return null;

  const [
    parentRows,
    childRows,
    teamRows,
    roundRows,
    programRows,
    tokenRows,
    metricsRows,
    newsRows,
    eventRows,
    similarRows,
  ] = await Promise.all([
    p.parent_id
      ? rows<RawProjectRef>(
          db,
          sql`select id, slug, name, logo_url, category from projects where id = ${p.parent_id} and merged_into_id is null`,
        )
      : Promise.resolve([] as RawProjectRef[]),
    rows<RawProjectRef>(
      db,
      sql`select id, slug, name, logo_url, category from projects
            where parent_id = ${id} and merged_into_id is null and review_status <> 'rejected' order by name`,
    ),
    rows<{
      link_id: number;
      person_id: number;
      slug: string;
      name: string;
      avatar_url: string | null;
      headline: string | null;
      role: string;
      is_current: boolean;
      started_on: string | null;
      ended_on: string | null;
      review_status: ReviewStatus;
      checked_at: number | null;
    }>(
      db,
      sql`select pp.id as link_id, pe.id as person_id, pe.slug, pe.name, pe.avatar_url, pe.headline,
              pp.role, pp.is_current, pp.started_on::text, pp.ended_on::text, pp.review_status,
              ${epoch('pp.checked_at')} as checked_at
            from project_people pp join people pe on pe.id = pp.person_id
            where pp.project_id = ${id} and pp.review_status <> 'rejected' and pe.merged_into_id is null
              and pe.review_status <> 'rejected'
            order by pp.is_current desc, (pp.review_status = 'verified') desc,
              (pp.role ilike '%founder%') desc, pp.role, pe.name`,
    ),
    rows<{
      id: number;
      slug: string;
      round_type: string | null;
      amount_usd: number | null;
      valuation_usd: number | null;
      announced_on: string;
      review_status: ReviewStatus;
      checked_at: number | null;
      checked_by: string | null;
    }>(
      db,
      sql`select id, slug, round_type, amount_usd, valuation_usd, announced_on::text, review_status,
              ${epoch('checked_at')} as checked_at, checked_by
            from funding_rounds
            where project_id = ${id} and merged_into_id is null and review_status <> 'rejected'
            order by announced_on desc, id desc`,
    ),
    rows<RawProgramLink>(
      db,
      sql`select pp.id as link_id, pp.relation, pp.note, pp.review_status as link_review,
              pg.id, pg.address, pg.name, pg.kind, pg.loader, pg.upgrade_authority, pg.last_deploy_slot,
              ${epoch('pg.onchain_checked_at')} as onchain_checked_at, pg.verified_build, pg.verified_repo,
              ${epoch('pg.verified_at')} as verified_at,
              a.tx_per_hour, a.failed_share, ${epoch('a.latest_tx_at')} as latest_tx_at, a.sample_size,
              a.window_seconds, ${epoch('a.captured_at')} as activity_at, a.provider, a.method
            from project_programs pp
            join programs pg on pg.id = pp.program_id
            left join lateral (
              select * from program_activity pa where pa.program_id = pg.id order by captured_at desc limit 1
            ) a on true
            where pp.project_id = ${id} and pp.review_status <> 'rejected'
            order by pp.relation, a.tx_per_hour desc nulls last, pg.name nulls last`,
    ),
    rows<{
      id: number;
      mint: string;
      symbol: string | null;
      name: string | null;
      logo_url: string | null;
      standard: string | null;
      decimals: number | null;
      is_primary: boolean;
      launched_at: number | null;
      review_status: ReviewStatus;
      checked_at: number | null;
      checked_by: string | null;
      price: number | null;
      market_cap: number | null;
      fdv: number | null;
      volume_24h: number | null;
      liquidity: number | null;
      holders: number | null;
      change_24h: number | null;
      provider: string | null;
      provider_updated_at: number | null;
      captured_at: number | null;
    }>(
      db,
      sql`select t.id, t.mint, t.symbol, t.name, t.logo_url, t.standard, t.decimals, t.is_primary,
              ${epoch('t.launched_at')} as launched_at, t.review_status, ${epoch('t.checked_at')} as checked_at,
              t.checked_by, s.price, s.market_cap, s.fdv, s.volume_24h, s.liquidity, s.holders, s.change_24h,
              s.provider, ${epoch('s.provider_updated_at')} as provider_updated_at,
              ${epoch('s.captured_at')} as captured_at
            from tokens t
            left join lateral (
              select * from market_snapshots ms where ms.token_id = t.id order by captured_at desc limit 1
            ) s on true
            where t.project_id = ${id} and t.review_status <> 'rejected'
            order by t.is_primary desc, s.market_cap desc nulls last`,
    ),
    rows<{
      tvl_solana: number | null;
      tvl_total: number | null;
      tvl_change_1d: number | null;
      tvl_change_7d: number | null;
      fees_30d: number | null;
      revenue_30d: number | null;
      products: { name: string; category: string | null; tvl: number | null }[] | null;
      provider: string;
      captured_at: number;
    }>(
      db,
      sql`select tvl_solana, tvl_total, tvl_change_1d, tvl_change_7d, fees_30d, revenue_30d, products,
              provider, ${epoch('captured_at')} as captured_at
            from project_metrics where project_id = ${id} order by captured_at desc limit 1`,
    ),
    rows<{
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
            where m.subject_type = 'project' and m.subject_id = ${id} and m.review_status <> 'rejected'
              and not n.hidden
            order by n.published_at desc limit 30`,
    ),
    rows<{
      id: number;
      slug: string;
      kind: string;
      title: string;
      starts_on: string;
      ends_on: string | null;
      url: string | null;
      location: string | null;
      amount_usd: number | null;
      review_status: ReviewStatus;
      matched_by: string | null;
      link_review: ReviewStatus;
    }>(
      db,
      sql`select e.id, e.slug, e.kind, e.title, e.starts_on::text, e.ends_on::text, e.url, e.location,
              e.amount_usd, e.review_status, l.matched_by, l.review_status as link_review
            from event_links l join events e on e.id = l.event_id
            where l.subject_type = 'project' and l.subject_id = ${id} and e.review_status <> 'rejected'
              and l.review_status <> 'rejected'
            order by e.starts_on desc limit 60`,
    ),
    rows<RawProjectRef & { tvl_solana: number | null; tagline: string | null }>(
      db,
      sql`select p.id, p.slug, p.name, p.logo_url, p.category, p.tagline, m.tvl_solana
            from projects p
            left join lateral (
              select tvl_solana from project_metrics m where m.project_id = p.id order by captured_at desc limit 1
            ) m on true
            where p.id <> ${id} and p.merged_into_id is null and p.review_status <> 'rejected'
              and p.category is not distinct from ${p.category}
            order by m.tvl_solana desc nulls last limit 6`,
    ),
  ]);

  // Investors of every round, in one query.
  const roundIds = roundRows.map((r) => r.id);
  const investorRows = roundIds.length
    ? await rows<{
        link_id: number;
        round_id: number;
        is_lead: boolean;
        name_as_reported: string | null;
        review_status: ReviewStatus;
        party_type: 'organization' | 'person';
        party_id: number;
        slug: string;
        name: string;
        image_url: string | null;
        kind: string | null;
      }>(
        db,
        sql`select ri.id as link_id, ri.round_id, ri.is_lead, ri.name_as_reported, ri.review_status,
              case when ri.organization_id is not null then 'organization' else 'person' end as party_type,
              coalesce(o.id, pe.id) as party_id, coalesce(o.slug, pe.slug) as slug,
              coalesce(o.name, pe.name) as name, coalesce(o.logo_url, pe.avatar_url) as image_url, o.kind
            from round_investors ri
            left join organizations o on o.id = ri.organization_id
            left join people pe on pe.id = ri.person_id
            where ri.round_id in ${inList(roundIds)} and ri.review_status <> 'rejected'
            order by ri.is_lead desc, coalesce(o.name, pe.name)`,
      )
    : [];

  const changeRows = await rows<{
    id: number;
    at: number;
    actor: string;
    action: string;
    summary: string;
  }>(
    db,
    sql`select id, ${epoch('at')} as at, actor, action, summary from changes
        where (subject_type = 'project' and subject_id = ${id})
          ${roundIds.length ? sql`or (subject_type = 'round' and subject_id in ${inList(roundIds)})` : sql``}
        order by at desc limit 12`,
  );

  const ev = await evidenceFor(db, [
    { type: 'project', ids: [id] },
    { type: 'project_person', ids: teamRows.map((t) => t.link_id) },
    { type: 'round', ids: roundIds },
    { type: 'round_investor', ids: investorRows.map((i) => i.link_id) },
    { type: 'project_program', ids: programRows.map((pr) => pr.link_id) },
    { type: 'program', ids: programRows.map((pr) => pr.id) },
    { type: 'token', ids: tokenRows.map((t) => t.id) },
    { type: 'event', ids: eventRows.map((e) => e.id) },
  ]);

  const project: ProjectRecord = {
    id: p.id,
    slug: p.slug,
    name: p.name,
    tagline: p.tagline,
    description: p.description,
    logoUrl: p.logo_url,
    category: p.category,
    tags: p.tags ?? [],
    status: p.status,
    foundedYear: p.founded_year,
    website: p.website,
    twitter: p.twitter,
    githubOrgs: p.github_orgs ?? [],
    discord: p.discord,
    telegram: p.telegram,
    docs: p.docs,
    coingeckoId: p.coingecko_id,
    defillamaKey: p.defillama_key,
    defillamaSlugs: p.defillama_slugs ?? [],
    lockedFields: p.locked_fields ?? [],
    reviewStatus: p.review_status,
    checkedAt: ms(p.checked_at),
    checkedBy: p.checked_by,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };

  const investorsByRound = new Map<number, RoundInvestor[]>();
  for (const r of investorRows) {
    const list = investorsByRound.get(r.round_id) ?? [];
    list.push({
      linkId: r.link_id,
      party: {
        type: r.party_type,
        id: r.party_id,
        slug: r.slug,
        name: r.name,
        imageUrl: r.image_url,
      },
      isLead: r.is_lead,
      nameAsReported: r.name_as_reported,
      reviewStatus: r.review_status,
      evidence: evidenceOf(ev, 'round_investor', r.link_id),
    });
    investorsByRound.set(r.round_id, list);
  }

  const rounds: RoundSummary[] = roundRows.map((r) => ({
    id: r.id,
    slug: r.slug,
    roundType: r.round_type,
    amountUsd: r.amount_usd,
    valuationUsd: r.valuation_usd,
    announcedOn: r.announced_on,
    reviewStatus: r.review_status,
    checkedAt: r.checked_at,
    checkedBy: r.checked_by,
    investors: investorsByRound.get(r.id) ?? [],
    evidence: evidenceOf(ev, 'round', r.id),
  }));

  // Investors across every round, each once, leads first.
  const kindByParty = new Map(investorRows.map((r) => [`${r.party_type}:${r.party_id}`, r.kind]));
  const investorMap = new Map<
    string,
    { party: PartyRef; isLead: boolean; rounds: ProjectInvestor['rounds'][number][] }
  >();
  for (const round of [...rounds].reverse()) {
    for (const inv of round.investors) {
      const k = `${inv.party.type}:${inv.party.id}`;
      const entry = investorMap.get(k) ?? { party: inv.party, isLead: false, rounds: [] };
      entry.isLead ||= inv.isLead;
      entry.rounds.push({
        slug: round.slug,
        roundType: round.roundType,
        announcedOn: round.announcedOn,
        isLead: inv.isLead,
      });
      investorMap.set(k, entry);
    }
  }
  const investors: ProjectInvestor[] = [...investorMap.entries()]
    .map(([k, v]) => ({ ...v, kind: kindByParty.get(k) ?? null }))
    .sort(
      (a, b) =>
        Number(b.isLead) - Number(a.isLead) ||
        Number(a.party.type === 'person') - Number(b.party.type === 'person') ||
        b.rounds.length - a.rounds.length ||
        a.party.name.localeCompare(b.party.name),
    );

  const historyRows = programRows.length
    ? await rows<{ program_id: number; t: number; v: number }>(
        db,
        sql`select program_id, ${epoch('captured_at')} as t, tx_per_hour as v from program_activity
            where program_id in ${inList(programRows.map((r) => r.id))}
              and tx_per_hour is not null
              and captured_at > to_timestamp(${(now - 14 * 86_400_000) / 1000})
            order by captured_at asc`,
      )
    : [];
  const historyOf = new Map<number, { t: number; v: number }[]>();
  for (const h of historyRows) {
    const list = historyOf.get(h.program_id) ?? [];
    list.push({ t: Number(h.t), v: Number(h.v) });
    historyOf.set(h.program_id, list);
  }

  const programs: ProgramLink[] = programRows.map((r) => ({
    linkId: r.link_id,
    relation: r.relation,
    note: r.note,
    reviewStatus: r.link_review,
    evidence: evidenceOf(ev, 'project_program', r.link_id),
    program: programFacts(r, evidenceOf(ev, 'program', r.id)),
    activity: activityOf(r, now),
    history: historyOf.get(r.id) ?? [],
  }));

  const tokens: TokenLink[] = tokenRows.map((t) => ({
    id: t.id,
    mint: t.mint,
    symbol: t.symbol,
    name: t.name,
    logoUrl: t.logo_url,
    standard: t.standard,
    decimals: t.decimals,
    isPrimary: t.is_primary,
    launchedAt: t.launched_at,
    reviewStatus: t.review_status,
    checkedAt: t.checked_at,
    checkedBy: t.checked_by,
    evidence: evidenceOf(ev, 'token', t.id),
    market:
      t.captured_at === null
        ? null
        : {
            price: t.price,
            marketCap: t.market_cap,
            fdv: t.fdv,
            volume24h: t.volume_24h,
            liquidity: t.liquidity,
            holders: t.holders,
            change24h: t.change_24h,
            provider: t.provider ?? 'unknown',
            providerUpdatedAt: t.provider_updated_at,
            capturedAt: t.captured_at,
          },
  }));

  const m = metricsRows[0];
  const metrics: ProjectMetricsView | null = m
    ? {
        tvlSolana: m.tvl_solana,
        tvlTotal: m.tvl_total,
        tvlChange1d: m.tvl_change_1d,
        tvlChange7d: m.tvl_change_7d,
        fees30d: m.fees_30d,
        revenue30d: m.revenue_30d,
        products: m.products ?? [],
        provider: m.provider,
        capturedAt: m.captured_at,
      }
    : null;

  const team: TeamMember[] = teamRows.map((t) => ({
    linkId: t.link_id,
    person: {
      id: t.person_id,
      slug: t.slug,
      name: t.name,
      avatarUrl: t.avatar_url,
      headline: t.headline,
    },
    role: t.role,
    isCurrent: t.is_current,
    startedOn: t.started_on,
    endedOn: t.ended_on,
    reviewStatus: t.review_status,
    checkedAt: t.checked_at,
    evidence: evidenceOf(ev, 'project_person', t.link_id),
  }));

  const events: EventItem[] = eventRows.map((e) => ({
    id: e.id,
    slug: e.slug,
    kind: e.kind,
    title: e.title,
    startsOn: e.starts_on,
    endsOn: e.ends_on,
    url: e.url,
    location: e.location,
    amountUsd: e.amount_usd,
    reviewStatus: e.review_status,
    linkMatchedBy: e.matched_by,
    linkReviewStatus: e.link_review,
    evidence: evidenceOf(ev, 'event', e.id),
  }));

  // Sources: every piece of evidence on the page, grouped by the link it cites.
  const labelled: { e: EvidenceRef; label: string }[] = [];
  const fieldLabel = (f: string) => FIELD_LABELS[f] ?? f;
  for (const e of evidenceOf(ev, 'project', id))
    labelled.push({ e, label: e.field ? `Profile: ${fieldLabel(e.field)}` : 'Profile' });
  for (const t of team)
    for (const e of t.evidence) labelled.push({ e, label: `Team: ${t.person.name} — ${t.role}` });
  for (const r of rounds) {
    const name = `${r.roundType ?? 'Round'} (${r.announcedOn.slice(0, 7)})`;
    for (const e of r.evidence)
      labelled.push({ e, label: `Funding: ${name}${e.field ? ` · ${fieldLabel(e.field)}` : ''}` });
    for (const i of r.investors)
      for (const e of i.evidence)
        labelled.push({ e, label: `Investor: ${i.party.name} in ${name}` });
  }
  for (const pl of programs) {
    for (const e of pl.evidence)
      labelled.push({
        e,
        label: `Program mapping: ${pl.program.name ?? short(pl.program.address)}`,
      });
    for (const e of pl.program.evidence)
      labelled.push({
        e,
        label: `Program: ${pl.program.name ?? short(pl.program.address)}${e.field ? ` · ${fieldLabel(e.field)}` : ''}`,
      });
  }
  for (const t of tokens)
    for (const e of t.evidence)
      labelled.push({
        e,
        label: `Token: ${t.symbol ?? short(t.mint)}${e.field ? ` · ${fieldLabel(e.field)}` : ''}`,
      });
  for (const e of events)
    for (const x of e.evidence) labelled.push({ e: x, label: `Event: ${e.title}` });

  const bySource = new Map<
    number,
    { source: SourceUse['source']; supports: SourceUse['supports'][number][]; last: number }
  >();
  for (const { e, label } of labelled) {
    const entry = bySource.get(e.sourceId) ?? {
      source: {
        sourceId: e.sourceId,
        url: e.url,
        title: e.title,
        publisher: e.publisher,
        kind: e.kind,
        sourceReview: e.sourceReview,
      },
      supports: [],
      last: 0,
    };
    if (!entry.supports.some((s) => s.label === label))
      entry.supports.push({
        label,
        method: e.method,
        checkedAt: e.checkedAt,
        checkedBy: e.checkedBy,
      });
    entry.last = Math.max(entry.last, e.checkedAt);
    bySource.set(e.sourceId, entry);
  }
  const sources: SourceUse[] = [...bySource.values()]
    .map((s) => ({ source: s.source, supports: s.supports, lastChecked: s.last }))
    .sort((a, b) => SOURCE_ORDER(a) - SOURCE_ORDER(b) || b.supports.length - a.supports.length);

  return {
    project,
    evidence: evidenceOf(ev, 'project', id),
    parent: parentRows[0] ? projectRef(parentRows[0]) : null,
    children: childRows.map(projectRef),
    team,
    rounds,
    investors,
    programs,
    tokens,
    metrics,
    news: newsRows.map((n) => ({
      id: n.id,
      url: n.url,
      title: n.title,
      publisher: n.publisher,
      publishedAt: n.published_at,
      summary: n.summary,
      matchedBy: n.matched_by,
      reviewStatus: n.review_status,
    })),
    events,
    sources,
    similar: similarRows.map((s) => ({
      ...projectRef(s),
      tvlSolana: s.tvl_solana,
      tagline: s.tagline,
    })),
    changes: changeRows,
  };
}

const SOURCE_KIND_ORDER = [
  'filing',
  'announcement',
  'press',
  'social',
  'registry',
  'repository',
  'onchain',
  'website',
  'database',
  'api',
];
const SOURCE_ORDER = (s: SourceUse) => {
  const i = SOURCE_KIND_ORDER.indexOf(s.source.kind);
  return i === -1 ? SOURCE_KIND_ORDER.length : i;
};

export const FIELD_LABELS: Record<string, string> = {
  description: 'description',
  tagline: 'summary',
  category: 'category',
  website: 'website',
  twitter: 'X account',
  status: 'status',
  amountUsd: 'amount',
  valuationUsd: 'valuation',
  announcedOn: 'date',
  roundType: 'round type',
  projectId: 'project',
  symbol: 'symbol',
  upgradeAuthority: 'upgrade authority',
  lastDeploySlot: 'last deploy',
  verifiedBuild: 'verified build',
  verifiedRepo: 'source repository',
  name: 'name',
  kind: 'type',
  foundedYear: 'founded',
  headline: 'headline',
  location: 'location',
  role: 'role',
};

export const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

interface RawProjectRef {
  id: number;
  slug: string;
  name: string;
  logo_url: string | null;
  category: string | null;
}

export const projectRef = (r: RawProjectRef): ProjectRef => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  logoUrl: r.logo_url,
  category: r.category,
});

export interface RawProgramLink {
  link_id: number;
  relation: ProgramRelation;
  note: string | null;
  link_review: ReviewStatus;
  id: number;
  address: string;
  name: string | null;
  kind: string | null;
  loader: string | null;
  upgrade_authority: string | null;
  last_deploy_slot: number | string | null;
  onchain_checked_at: number | null;
  verified_build: boolean | null;
  verified_repo: string | null;
  verified_at: number | null;
  tx_per_hour: number | null;
  failed_share: number | null;
  latest_tx_at: number | null;
  sample_size: number | null;
  window_seconds: number | null;
  activity_at: number | null;
  provider: string | null;
  method: string | null;
}

export function programFacts(r: RawProgramLink, evidence: readonly EvidenceRef[]): ProgramFacts {
  return {
    id: r.id,
    address: r.address,
    name: r.name,
    kind: r.kind,
    loader: r.loader,
    upgradeAuthority: r.upgrade_authority,
    lastDeploySlot: r.last_deploy_slot === null ? null : Number(r.last_deploy_slot),
    onchainCheckedAt: r.onchain_checked_at,
    verifiedBuild: r.verified_build,
    verifiedRepo: r.verified_repo,
    verifiedAt: r.verified_at,
    evidence,
  };
}

export function activityOf(r: RawProgramLink, now: number): ActivitySnapshot | null {
  if (r.activity_at === null) return null;
  return {
    txPerHour: r.tx_per_hour,
    failedShare: r.failed_share,
    latestTxAt: r.latest_tx_at,
    sampleSize: r.sample_size ?? 0,
    windowSeconds: r.window_seconds,
    capturedAt: r.activity_at,
    provider: r.provider ?? 'Solana RPC',
    method: r.method ?? '',
    level: activityLevel(r.tx_per_hour, r.latest_tx_at, now),
  };
}

/** A URL-safe slug for a name, exported for pages that build links from names. */
export const slugFor = toSlug;
