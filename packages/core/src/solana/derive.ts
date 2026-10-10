/**
 * Derivations for the Solana research platform. Pure.
 *
 * Investors are not a dataset anyone publishes for free — they are a view
 * over funding rounds. Every investor page, ranking and co-investor graph is
 * computed here from the rounds, so it can never disagree with them.
 */

import type { FundingRound, Investor, Project, TokenMarket } from './types';

/** "Polychain Capital" → "polychain-capital". Stable, URL-safe, lossy by design. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Investors
// ---------------------------------------------------------------------------

/**
 * Every investor that appears in any round, with its record.
 *
 * Names are matched by slug, so "Multicoin Capital" and "Multicoin capital"
 * are one investor; the display name is the most frequent spelling seen.
 */
export function investorsFromRounds(rounds: readonly FundingRound[]): Investor[] {
  const bySlug = new Map<
    string,
    { names: Map<string, number>; rounds: FundingRound[]; leads: number; projects: Set<string> }
  >();

  for (const round of rounds) {
    const seen = new Set<string>();
    const add = (name: string, lead: boolean) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const slug = slugify(trimmed);
      if (!slug || seen.has(slug)) return;
      seen.add(slug);
      let entry = bySlug.get(slug);
      if (!entry) {
        entry = { names: new Map(), rounds: [], leads: 0, projects: new Set() };
        bySlug.set(slug, entry);
      }
      entry.names.set(trimmed, (entry.names.get(trimmed) ?? 0) + 1);
      entry.rounds.push(round);
      if (lead) entry.leads++;
      entry.projects.add(round.projectSlug ?? slugify(round.projectName));
    };
    round.leadInvestors.forEach((name) => add(name, true));
    round.otherInvestors.forEach((name) => add(name, false));
  }

  return [...bySlug.entries()].map(([slug, entry]) => {
    const sorted = [...entry.rounds].sort((a, b) => b.date - a.date);
    const name = [...entry.names.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    return {
      slug,
      name,
      rounds: sorted,
      leadCount: entry.leads,
      portfolioCount: entry.projects.size,
      roundVolume: sorted.reduce((sum, r) => sum + (r.amount ?? 0), 0),
      firstDeal: sorted.length ? sorted[sorted.length - 1]!.date : null,
      lastDeal: sorted.length ? sorted[0]!.date : null,
    };
  });
}

export type InvestorSort = 'deals' | 'leads' | 'volume' | 'recent';

export function sortInvestors(investors: readonly Investor[], sort: InvestorSort): Investor[] {
  const key: Record<InvestorSort, (i: Investor) => number> = {
    deals: (i) => i.rounds.length,
    leads: (i) => i.leadCount,
    volume: (i) => i.roundVolume,
    recent: (i) => i.lastDeal ?? 0,
  };
  return [...investors].sort((a, b) => key[sort](b) - key[sort](a) || a.name.localeCompare(b.name));
}

/** Who else shows up in this investor's rounds, most frequent first. */
export function coInvestors(
  investor: Investor,
  limit = 12,
): { name: string; slug: string; together: number }[] {
  const counts = new Map<string, { name: string; together: number }>();
  for (const round of investor.rounds) {
    for (const name of [...round.leadInvestors, ...round.otherInvestors]) {
      const slug = slugify(name);
      if (!slug || slug === investor.slug) continue;
      const entry = counts.get(slug) ?? { name: name.trim(), together: 0 };
      entry.together++;
      counts.set(slug, entry);
    }
  }
  return [...counts.entries()]
    .map(([slug, v]) => ({ slug, ...v }))
    .sort((a, b) => b.together - a.together || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Deal count per category, for an investor's "where it invests" breakdown. */
export function categoryMix(
  rounds: readonly FundingRound[],
): { category: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rounds) {
    const c = r.category ?? 'Uncategorised';
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

/** Deal-size buckets, for an investor's size profile. Undisclosed rounds are their own bucket. */
export const ROUND_SIZE_BUCKETS = [
  { label: '< $1M', min: 0, max: 1e6 },
  { label: '$1M – $5M', min: 1e6, max: 5e6 },
  { label: '$5M – $10M', min: 5e6, max: 1e7 },
  { label: '$10M – $30M', min: 1e7, max: 3e7 },
  { label: '$30M – $50M', min: 3e7, max: 5e7 },
  { label: '$50M – $100M', min: 5e7, max: 1e8 },
  { label: '$100M+', min: 1e8, max: Infinity },
] as const;

export function sizeMix(rounds: readonly FundingRound[]): { label: string; count: number }[] {
  const out = ROUND_SIZE_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  let undisclosed = 0;
  for (const r of rounds) {
    if (r.amount === null) {
      undisclosed++;
      continue;
    }
    const i = ROUND_SIZE_BUCKETS.findIndex((b) => r.amount! >= b.min && r.amount! < b.max);
    if (i >= 0) out[i]!.count++;
  }
  return [...out, { label: 'Undisclosed', count: undisclosed }];
}

// ---------------------------------------------------------------------------
// Funding over time
// ---------------------------------------------------------------------------

export interface MonthlyFunding {
  /** "2026-09" */
  readonly month: string;
  readonly start: number;
  /** Sum of disclosed amounts. Rounds without an amount count only toward `rounds`. */
  readonly amount: number;
  readonly rounds: number;
}

const monthKey = (ms: number) => new Date(ms).toISOString().slice(0, 7);

/** The last `months` calendar months (UTC), oldest first, including empty ones. */
export function fundingByMonth(
  rounds: readonly FundingRound[],
  months: number,
  now: number,
): MonthlyFunding[] {
  const end = new Date(now);
  const buckets: MonthlyFunding[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1));
    buckets.push({ month: monthKey(d.getTime()), start: d.getTime(), amount: 0, rounds: 0 });
  }
  const index = new Map(buckets.map((b, i) => [b.month, i]));
  const mutable = buckets.map((b) => ({ ...b }));
  for (const r of rounds) {
    const i = index.get(monthKey(r.date));
    if (i === undefined) continue;
    mutable[i]!.rounds++;
    mutable[i]!.amount += r.amount ?? 0;
  }
  return mutable;
}

export interface FundingWindow {
  readonly amount: number;
  readonly rounds: number;
  readonly largest: FundingRound | null;
}

/** Funding in the trailing window, and its largest disclosed round. */
export function fundingInWindow(
  rounds: readonly FundingRound[],
  windowMs: number,
  now: number,
): FundingWindow {
  let amount = 0;
  let count = 0;
  let largest: FundingRound | null = null;
  for (const r of rounds) {
    if (r.date < now - windowMs || r.date > now) continue;
    count++;
    amount += r.amount ?? 0;
    if (r.amount !== null && (largest === null || r.amount > (largest.amount ?? 0))) largest = r;
  }
  return { amount, rounds: count, largest };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export type ProjectSort = 'tvl' | 'tvl-change' | 'market-cap' | 'recent' | 'raised' | 'name';

export interface ProjectFilters {
  readonly query: string;
  readonly categories: readonly string[];
  /** `true` only projects with a token; `false` only without; `null` either. */
  readonly hasToken: boolean | null;
  /** `true` only projects with at least one disclosed round. */
  readonly funded: boolean | null;
  /** Only projects backed by this investor slug. */
  readonly investor: string | null;
  readonly minTvl: number | null;
}

export const EMPTY_PROJECT_FILTERS: ProjectFilters = {
  query: '',
  categories: [],
  hasToken: null,
  funded: null,
  investor: null,
  minTvl: null,
};

export interface ProjectRow {
  readonly project: Project;
  readonly market: TokenMarket | null;
  readonly rounds: readonly FundingRound[];
  /** Disclosed total. `null` when no round disclosed an amount. */
  readonly raised: number | null;
  readonly investorSlugs: ReadonlySet<string>;
}

/** A project's token market: by mint first (exact), then by CoinGecko id. */
export function marketFor(
  project: Pick<Project, 'tokenMint' | 'geckoId'>,
  markets: ReadonlyMap<string, TokenMarket>,
): TokenMarket | null {
  return (
    (project.tokenMint ? markets.get(project.tokenMint) : undefined) ??
    (project.geckoId ? markets.get(`cg:${project.geckoId}`) : undefined) ??
    null
  );
}

export function projectRows(
  projects: readonly Project[],
  markets: ReadonlyMap<string, TokenMarket>,
  rounds: readonly FundingRound[],
): ProjectRow[] {
  const roundsBySlug = new Map<string, FundingRound[]>();
  for (const r of rounds) {
    if (!r.projectSlug) continue;
    const list = roundsBySlug.get(r.projectSlug) ?? [];
    list.push(r);
    roundsBySlug.set(r.projectSlug, list);
  }
  return projects.map((project) => {
    const own = (roundsBySlug.get(project.slug) ?? []).sort((a, b) => b.date - a.date);
    const disclosed = own.filter((r) => r.amount !== null);
    return {
      project,
      market: marketFor(project, markets),
      rounds: own,
      raised: disclosed.length ? disclosed.reduce((s, r) => s + r.amount!, 0) : null,
      investorSlugs: new Set(
        own.flatMap((r) => [...r.leadInvestors, ...r.otherInvestors].map(slugify)),
      ),
    };
  });
}

export function filterProjects(rows: readonly ProjectRow[], f: ProjectFilters): ProjectRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter(({ project, market, rounds, investorSlugs }) => {
    if (q) {
      const hay = `${project.name} ${project.symbol ?? ''} ${project.category ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.categories.length && !project.tags.some((tag) => f.categories.includes(tag)))
      return false;
    if (f.hasToken !== null && Boolean(project.symbol || market) !== f.hasToken) return false;
    if (f.funded !== null && rounds.length > 0 !== f.funded) return false;
    if (f.investor && !investorSlugs.has(f.investor)) return false;
    if (f.minTvl !== null && (project.tvlSolana ?? 0) < f.minTvl) return false;
    return true;
  });
}

/** Missing values sort last whichever way the sort runs — never as zero. */
export function sortProjects(rows: readonly ProjectRow[], sort: ProjectSort): ProjectRow[] {
  const value: Record<ProjectSort, (r: ProjectRow) => number | string | null> = {
    tvl: (r) => r.project.tvlSolana,
    'tvl-change': (r) => r.project.tvlChange7d,
    'market-cap': (r) => r.market?.marketCap ?? null,
    recent: (r) => r.project.listedAt,
    raised: (r) => r.raised,
    name: (r) => r.project.name.toLowerCase(),
  };
  const pick = value[sort];
  return [...rows].sort((a, b) => {
    const x = pick(a);
    const y = pick(b);
    if (x === null && y === null) return a.project.name.localeCompare(b.project.name);
    if (x === null) return 1;
    if (y === null) return -1;
    if (typeof x === 'string' && typeof y === 'string') return x.localeCompare(y);
    return (y as number) - (x as number);
  });
}

/** Category counts across a set of rows, for the filter sidebar. */
export function categoryFacets(rows: readonly ProjectRow[]): { category: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const { project } of rows) {
    for (const tag of project.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}
