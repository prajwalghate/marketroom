/**
 * The project directory: one row per project, joined to its latest funding,
 * value locked, on-chain activity, token and review state.
 *
 * Loaded whole (a few hundred to a few thousand rows) and filtered in memory:
 * every filter needs facet counts over the same set, and one query plus a
 * pass in JavaScript is cheaper and simpler than a query per facet.
 */

import { activityLevel, normalizeName, type ActivityLevel } from '@marketroom/core';
import { sql } from 'drizzle-orm';
import { rows, type Executor } from '../client';
import type { ProjectStatus, ReviewStatus } from '../schema';

export interface DirectoryRow {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly logoUrl: string | null;
  readonly tagline: string | null;
  readonly category: string | null;
  readonly tags: readonly string[];
  readonly status: ProjectStatus | null;
  readonly reviewStatus: ReviewStatus;
  readonly checkedAt: number | null;
  readonly updatedAt: number;
  readonly tvlSolana: number | null;
  readonly tvlChange7d: number | null;
  readonly metricsAt: number | null;
  readonly roundCount: number;
  readonly raisedUsd: number | null;
  readonly latestRound: {
    readonly slug: string;
    readonly roundType: string | null;
    readonly amountUsd: number | null;
    readonly announcedOn: string;
  } | null;
  readonly roundTypes: readonly string[];
  readonly investorSlugs: readonly string[];
  readonly programCount: number;
  readonly txPerHour: number | null;
  readonly latestTxAt: number | null;
  readonly activityAt: number | null;
  readonly activity: ActivityLevel;
  readonly token: {
    readonly mint: string;
    readonly symbol: string | null;
    readonly price: number | null;
    readonly change24h: number | null;
    readonly marketCap: number | null;
  } | null;
  readonly teamCount: number;
  /** Lower-cased names, aliases and token symbol, for search. */
  readonly searchText: string;
}

interface Raw {
  id: number;
  slug: string;
  name: string;
  logo_url: string | null;
  tagline: string | null;
  category: string | null;
  tags: string[] | null;
  status: ProjectStatus | null;
  review_status: ReviewStatus;
  checked_at: number | null;
  updated_at: number;
  tvl_solana: number | null;
  tvl_change_7d: number | null;
  metrics_at: number | null;
  round_count: number;
  raised: number | null;
  round_types: string[] | null;
  lr_slug: string | null;
  lr_type: string | null;
  lr_amount: number | null;
  lr_date: string | null;
  investor_slugs: string[] | null;
  program_count: number;
  tx_per_hour: number | null;
  latest_tx_at: number | null;
  activity_at: number | null;
  token_mint: string | null;
  token_symbol: string | null;
  token_price: number | null;
  token_change: number | null;
  token_mcap: number | null;
  team_count: number;
  alias_text: string | null;
}

export async function loadDirectory(db: Executor, now = Date.now()): Promise<DirectoryRow[]> {
  const found = await rows<Raw>(
    db,
    sql`
    with
    m as (
      select distinct on (project_id) project_id, tvl_solana, tvl_change_7d, captured_at
      from project_metrics order by project_id, captured_at desc
    ),
    live_rounds as (
      select * from funding_rounds where merged_into_id is null and review_status <> 'rejected'
    ),
    r as (
      select project_id, count(*)::int as n, sum(amount_usd)::float8 as raised,
        array_remove(array_agg(distinct round_type), null) as types
      from live_rounds group by project_id
    ),
    lr as (
      select distinct on (project_id) project_id, slug, round_type, amount_usd, announced_on::text as announced_on
      from live_rounds order by project_id, announced_on desc, id desc
    ),
    inv as (
      select fr.project_id, array_agg(distinct o.slug) as slugs
      from round_investors ri
      join live_rounds fr on fr.id = ri.round_id
      join organizations o on o.id = ri.organization_id and o.merged_into_id is null
      where ri.review_status <> 'rejected'
      group by fr.project_id
    ),
    act as (
      select pp.project_id, count(*)::int as programs, sum(a.tx_per_hour)::float8 as tx_per_hour,
        max(a.latest_tx_at) as latest_tx_at, max(a.captured_at) as captured_at
      from project_programs pp
      left join lateral (
        select tx_per_hour, latest_tx_at, captured_at from program_activity pa
        where pa.program_id = pp.program_id order by captured_at desc limit 1
      ) a on true
      where pp.review_status <> 'rejected' and pp.relation = 'operates'
      group by pp.project_id
    ),
    tok as (
      select distinct on (t.project_id) t.project_id, t.mint, t.symbol, s.price, s.change_24h, s.market_cap
      from tokens t
      left join lateral (
        select price, change_24h, market_cap from market_snapshots ms
        where ms.token_id = t.id order by captured_at desc limit 1
      ) s on true
      where t.project_id is not null and t.review_status <> 'rejected'
      order by t.project_id, t.is_primary desc, t.id
    ),
    team as (
      select project_id, count(*)::int as n from project_people
      where review_status <> 'rejected' group by project_id
    ),
    al as (
      select subject_id, string_agg(alias, ' ') as text from aliases
      where subject_type = 'project' group by subject_id
    )
    select p.id, p.slug, p.name, p.logo_url, p.tagline, p.category, p.tags, p.status, p.review_status,
      (extract(epoch from p.checked_at) * 1000)::float8 as checked_at,
      (extract(epoch from p.updated_at) * 1000)::float8 as updated_at,
      m.tvl_solana, m.tvl_change_7d, (extract(epoch from m.captured_at) * 1000)::float8 as metrics_at,
      coalesce(r.n, 0) as round_count, r.raised, r.types as round_types,
      lr.slug as lr_slug, lr.round_type as lr_type, lr.amount_usd as lr_amount, lr.announced_on as lr_date,
      inv.slugs as investor_slugs,
      coalesce(act.programs, 0) as program_count, act.tx_per_hour,
      (extract(epoch from act.latest_tx_at) * 1000)::float8 as latest_tx_at,
      (extract(epoch from act.captured_at) * 1000)::float8 as activity_at,
      tok.mint as token_mint, tok.symbol as token_symbol, tok.price as token_price,
      tok.change_24h as token_change, tok.market_cap as token_mcap,
      coalesce(team.n, 0) as team_count, al.text as alias_text
    from projects p
    left join m on m.project_id = p.id
    left join r on r.project_id = p.id
    left join lr on lr.project_id = p.id
    left join inv on inv.project_id = p.id
    left join act on act.project_id = p.id
    left join tok on tok.project_id = p.id
    left join team on team.project_id = p.id
    left join al on al.subject_id = p.id
    where p.merged_into_id is null and p.review_status <> 'rejected'`,
  );

  return found.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    logoUrl: r.logo_url,
    tagline: r.tagline,
    category: r.category,
    tags: r.tags ?? [],
    status: r.status,
    reviewStatus: r.review_status,
    checkedAt: r.checked_at,
    updatedAt: r.updated_at,
    tvlSolana: r.tvl_solana,
    tvlChange7d: r.tvl_change_7d,
    metricsAt: r.metrics_at,
    roundCount: r.round_count,
    raisedUsd: r.raised,
    latestRound: r.lr_slug
      ? { slug: r.lr_slug, roundType: r.lr_type, amountUsd: r.lr_amount, announcedOn: r.lr_date! }
      : null,
    roundTypes: r.round_types ?? [],
    investorSlugs: r.investor_slugs ?? [],
    programCount: r.program_count,
    txPerHour: r.tx_per_hour,
    latestTxAt: r.latest_tx_at,
    activityAt: r.activity_at,
    activity: r.program_count ? activityLevel(r.tx_per_hour, r.latest_tx_at, now) : 'unknown',
    token: r.token_mint
      ? {
          mint: r.token_mint,
          symbol: r.token_symbol,
          price: r.token_price,
          change24h: r.token_change,
          marketCap: r.token_mcap,
        }
      : null,
    teamCount: r.team_count,
    searchText: `${r.name} ${r.alias_text ?? ''} ${r.token_symbol ?? ''} ${r.slug}`.toLowerCase(),
  }));
}

// ---------------------------------------------------------------------------
// Filtering, in memory
// ---------------------------------------------------------------------------

export const DIRECTORY_SORTS = {
  tvl: 'Value locked',
  raised: 'Total raised',
  latest: 'Latest round',
  activity: 'On-chain activity',
  checked: 'Recently checked',
  name: 'Name',
} as const;
export type DirectorySort = keyof typeof DIRECTORY_SORTS;

export interface DirectoryFilters {
  readonly q?: string;
  readonly category?: string;
  readonly status?: string;
  readonly round?: string;
  readonly investor?: string;
  readonly activity?: string;
  readonly funded?: string;
  readonly review?: string;
  readonly sort?: string;
  readonly page?: number;
}

export interface Facet {
  readonly value: string;
  readonly label: string;
  readonly count: number;
}

export interface DirectoryPage {
  readonly rows: readonly DirectoryRow[];
  readonly total: number;
  readonly page: number;
  readonly pages: number;
  readonly sort: DirectorySort;
  readonly facets: {
    readonly category: Facet[];
    readonly status: Facet[];
    readonly round: Facet[];
    readonly activity: Facet[];
    readonly review: Facet[];
    /** Investor slugs, most frequent first; labels are slugs (callers name them). */
    readonly investor: Facet[];
  };
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  acquired: 'Acquired',
  closed: 'Closed',
  pre_launch: 'Pre-launch',
  unknown: 'Not assessed',
};

const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
  dormant: 'Dormant',
  unknown: 'No mapped programs',
};

const REVIEW_LABEL: Record<string, string> = {
  verified: 'Checked by an editor',
  unreviewed: 'Imported, not yet checked',
  needs_review: 'Flagged for review',
};

const DAY = 86_400_000;

type Predicate = (r: DirectoryRow) => boolean;

function predicates(f: DirectoryFilters, now: number): Record<string, Predicate | null> {
  const q = normalizeName(f.q ?? '');
  return {
    q: q ? (r) => r.searchText.includes(q) || normalizeName(r.searchText).includes(q) : null,
    category: f.category ? (r) => r.category === f.category || r.tags.includes(f.category!) : null,
    status: f.status ? (r) => (r.status ?? 'unknown') === f.status : null,
    round: f.round ? (r) => r.roundTypes.includes(f.round!) : null,
    investor: f.investor ? (r) => r.investorSlugs.includes(f.investor!) : null,
    activity: f.activity ? (r) => r.activity === f.activity : null,
    funded:
      f.funded === 'yes'
        ? (r) => r.roundCount > 0
        : f.funded === 'no'
          ? (r) => r.roundCount === 0
          : f.funded === '12m'
            ? (r) => !!r.latestRound && Date.parse(r.latestRound.announcedOn) >= now - 365 * DAY
            : null,
    review: f.review
      ? f.review === 'stale'
        ? (r) => r.checkedAt === null || now - r.checkedAt > 90 * DAY
        : (r) => r.reviewStatus === f.review
      : null,
  };
}

function facet(
  rowsIn: readonly DirectoryRow[],
  values: (r: DirectoryRow) => readonly string[],
  label: (v: string) => string = (v) => v,
): Facet[] {
  const counts = new Map<string, number>();
  for (const r of rowsIn)
    for (const v of new Set(values(r))) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: label(value), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

const nullsLast = (a: number | null, b: number | null) =>
  a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : b - a;

export function queryDirectory(
  all: readonly DirectoryRow[],
  filters: DirectoryFilters,
  options: { now?: number; pageSize?: number } = {},
): DirectoryPage {
  const now = options.now ?? Date.now();
  const pageSize = options.pageSize ?? 30;
  const preds = predicates(filters, now);
  const pass = (r: DirectoryRow, except?: string) =>
    Object.entries(preds).every(([k, p]) => k === except || !p || p(r));

  // Each facet counts over rows matching every *other* filter, so its counts
  // say what choosing an option would leave.
  const facets = {
    category: facet(
      all.filter((r) => pass(r, 'category')),
      (r) => (r.category ? [r.category] : []),
    ),
    status: facet(
      all.filter((r) => pass(r, 'status')),
      (r) => [r.status ?? 'unknown'],
      (v) => STATUS_LABEL[v] ?? v,
    ),
    round: facet(
      all.filter((r) => pass(r, 'round')),
      (r) => r.roundTypes,
    ),
    activity: facet(
      all.filter((r) => pass(r, 'activity')),
      (r) => [r.activity],
      (v) => ACTIVITY_LABEL[v as ActivityLevel] ?? v,
    ),
    review: facet(
      all.filter((r) => pass(r, 'review')),
      (r) => [r.reviewStatus],
      (v) => REVIEW_LABEL[v] ?? v,
    ),
    investor: facet(
      all.filter((r) => pass(r, 'investor')),
      (r) => r.investorSlugs,
    ).slice(0, 40),
  };

  const sort = (
    filters.sort && filters.sort in DIRECTORY_SORTS ? filters.sort : 'tvl'
  ) as DirectorySort;
  const matched = all.filter((r) => pass(r));
  const compare: Record<DirectorySort, (a: DirectoryRow, b: DirectoryRow) => number> = {
    tvl: (a, b) => nullsLast(a.tvlSolana, b.tvlSolana),
    raised: (a, b) => nullsLast(a.raisedUsd, b.raisedUsd) || b.roundCount - a.roundCount,
    latest: (a, b) =>
      nullsLast(
        a.latestRound ? Date.parse(a.latestRound.announcedOn) : null,
        b.latestRound ? Date.parse(b.latestRound.announcedOn) : null,
      ),
    activity: (a, b) => nullsLast(a.txPerHour, b.txPerHour),
    checked: (a, b) => nullsLast(a.checkedAt, b.checkedAt) || b.updatedAt - a.updatedAt,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  matched.sort(
    (a, b) =>
      compare[sort](a, b) || nullsLast(a.tvlSolana, b.tvlSolana) || a.name.localeCompare(b.name),
  );

  const pages = Math.max(1, Math.ceil(matched.length / pageSize));
  const page = Math.min(Math.max(1, filters.page ?? 1), pages);
  return {
    rows: matched.slice((page - 1) * pageSize, page * pageSize),
    total: matched.length,
    page,
    pages,
    sort,
    facets,
  };
}
