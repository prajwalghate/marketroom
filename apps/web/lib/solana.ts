import 'server-only';

import {
  DefiLlamaSolana,
  enrichMarket,
  GeckoTerminal,
  type DailyCandle,
  type PoolRef,
  mapSettledLimit,
  SOL_MINT,
  SolanaCompassStaking,
  SolanaMarkets,
} from '@marketroom/adapters';
import type {
  FearGreed,
  FlowTotals,
  FundingRound,
  Investor,
  Project,
  ProjectDetail,
  SeriesPoint,
  StakePool,
  TokenMarket,
} from '@marketroom/core';
import { investorsFromRounds, projectRows, slugify, type ProjectRow } from '@marketroom/core';
import { unstable_cache } from 'next/cache';

/**
 * Server data layer for the Solana research platform.
 *
 * The rule is the snapshot's rule: one poller, many readers. Every upstream
 * dataset is fetched on its own cadence — as often as it plausibly changes,
 * no more — and shared by every page and every visitor. A page render is a
 * handful of cache reads and some pure joins, never an upstream request.
 *
 * Cadences: prices 5 min · chain flows 15 min · projects 1 h · a project's
 * detail 1 h · funding 12 h. Funding is slow-moving and the most expensive to
 * assemble, so it is the longest.
 */

const MINUTE = 60;
const HOUR = 60 * MINUTE;

/**
 * One in-flight assembly per dataset, shared by every concurrent caller.
 *
 * `unstable_cache` dedupes nothing on a miss: five requests arriving on a cold
 * cache start five copies of the same assembly. For the project list that is
 * five 16 MB downloads; for funding, five passes of several hundred record
 * fetches — enough to starve every other dataset into timeouts, which is what
 * happened in development before this existed.
 */
const inflight = new Map<string, Promise<unknown>>();
function singleFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = run().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const getSolanaProjects = unstable_cache(
  async (): Promise<Project[]> => singleFlight('projects', () => new DefiLlamaSolana().projects()),
  ['solana-projects-v2'],
  { revalidate: HOUR, tags: ['solana'] },
);

export async function getProject(slug: string): Promise<Project | null> {
  return (await getSolanaProjects()).find((p) => p.slug === slug) ?? null;
}

/**
 * The canonical slug for what someone typed: an exact slug, else a project
 * whose *name* slugifies to it. Slugs come from the source's ids
 * (`kamino-finance`), but people type names (`kamino`) — and a link that
 * silently resolves to nothing is worse than a redirect.
 */
export async function resolveProjectSlug(input: string): Promise<string | null> {
  const projects = await getSolanaProjects();
  if (projects.some((p) => p.slug === input)) return input;
  const wanted = slugify(input);
  return projects.find((p) => slugify(p.name) === wanted)?.slug ?? null;
}

export const getProjectDetail = unstable_cache(
  async (slug: string): Promise<ProjectDetail | null> =>
    singleFlight(`detail:${slug}`, async () => {
      try {
        return await new DefiLlamaSolana().detail(slug);
      } catch {
        return null;
      }
    }),
  ['solana-project-detail-v1'],
  { revalidate: HOUR, tags: ['solana'] },
);

// ---------------------------------------------------------------------------
// Markets
// ---------------------------------------------------------------------------

const COINGECKO_KEY = process.env.COINGECKO_API_KEY ?? null;

export interface TokenMarkets {
  /** Every token we hold a market for, keyed by mint (and `cg:<id>` aliases). */
  readonly byKey: Record<string, TokenMarket>;
  /** Jupiter's own rankings over the last 24 hours, as mint lists. */
  readonly trending: readonly string[];
  readonly traded: readonly string[];
  readonly organic: readonly string[];
  readonly fetchedAt: number;
}

/**
 * Every token market the site shows, from one pass.
 *
 * Jupiter for every project token (by mint), for SOL, and for its three
 * ranked lists; CoinGecko history laid over projects that have a CoinGecko id,
 * only when a key is configured. A handful of requests every five minutes,
 * shared by every page.
 */
export const getTokenMarkets = unstable_cache(
  async (): Promise<TokenMarkets> => singleFlight('markets', assembleTokenMarkets),
  ['solana-token-markets-v2'],
  { revalidate: 5 * MINUTE, tags: ['solana'] },
);

async function assembleTokenMarkets(): Promise<TokenMarkets> {
  const markets = new SolanaMarkets({ coingeckoKey: COINGECKO_KEY });
  const projects = await getSolanaProjects();
  const none = () => [] as TokenMarket[];
  const [trending, traded, organic] = await Promise.all([
    markets.list('toptrending', 100).catch(none),
    markets.list('toptraded', 100).catch(none),
    markets.list('toporganicscore', 100).catch(none),
  ]);
  const listed = new Set([...trending, ...traded, ...organic].map((m) => m.key));
  const wanted = [
    SOL_MINT,
    ...projects.map((p) => p.tokenMint).filter((m): m is string => !!m),
  ].filter((mint) => !listed.has(mint));
  const direct = await markets.byMints(wanted).catch(() => [] as TokenMarket[]);

  const byKey: Record<string, TokenMarket> = {};
  for (const m of [...trending, ...traded, ...organic, ...direct]) byKey[m.key] = m;

  // CoinGecko history for projects that carry both ids — keyed by mint, so
  // the project's market gains its ATH and sparkline in place.
  const pairs = projects.filter((p) => p.tokenMint && p.geckoId && byKey[p.tokenMint]);
  const gecko = await markets.geckoByIds(pairs.map((p) => p.geckoId!)).catch(() => []);
  const geckoById = new Map(gecko.map((g) => [g.geckoId!, g]));
  for (const p of pairs) {
    const enriched = enrichMarket(byKey[p.tokenMint!]!, geckoById.get(p.geckoId!));
    byKey[p.tokenMint!] = enriched;
    byKey[`cg:${p.geckoId}`] = enriched;
  }

  return {
    byKey,
    trending: trending.map((m) => m.key),
    traded: traded.map((m) => m.key),
    organic: organic.map((m) => m.key),
    fetchedAt: Date.now(),
  };
}

const EMPTY_MARKETS: TokenMarkets = {
  byKey: {},
  trending: [],
  traded: [],
  organic: [],
  fetchedAt: 0,
};

export async function getMarketIndex(): Promise<Map<string, TokenMarket>> {
  const markets = await getTokenMarkets().catch(() => EMPTY_MARKETS);
  return new Map(Object.entries(markets.byKey));
}

export async function getMarkets(): Promise<TokenMarkets> {
  return getTokenMarkets().catch(() => EMPTY_MARKETS);
}

/**
 * One token's live market, for a token the database has not recorded — but
 * only one the shared market pass already holds (the trending, traded and
 * organic lists, and every project token), which is every token the site
 * links to. An arbitrary address is never looked up: a public page that
 * fetched upstream for any input would let anyone spend our API quota.
 */
export async function getLiveToken(mint: string): Promise<TokenMarket | null> {
  return (await getMarkets()).byKey[mint] ?? null;
}

// ---------------------------------------------------------------------------
// Chain overview
// ---------------------------------------------------------------------------

/** Daily series, trimmed to the last two years — enough for every range the UI offers. */
const lastDays = (series: SeriesPoint[], days: number) =>
  series.filter((p) => p.t >= Date.now() - days * 24 * HOUR * 1000);

export const getChainTvl = unstable_cache(
  async (): Promise<SeriesPoint[]> => lastDays(await new DefiLlamaSolana().chainTvl(), 730),
  ['solana-chain-tvl-v1'],
  { revalidate: 15 * MINUTE, tags: ['solana'] },
);

export const getStablecoins = unstable_cache(
  async (): Promise<SeriesPoint[]> => lastDays(await new DefiLlamaSolana().stablecoins(), 730),
  ['solana-stablecoins-v1'],
  { revalidate: 15 * MINUTE, tags: ['solana'] },
);

export const getFlows = unstable_cache(
  async (kind: 'fees' | 'revenue' | 'dexs'): Promise<FlowTotals> => {
    const flows = await new DefiLlamaSolana().flows(kind);
    return { ...flows, series: lastDays([...flows.series], 730) };
  },
  ['solana-flows-v1'],
  { revalidate: 15 * MINUTE, tags: ['solana'] },
);

export const getFearGreed = unstable_cache(
  async (): Promise<FearGreed | null> => new SolanaMarkets().fearGreed().catch(() => null),
  ['fear-greed-v1'],
  { revalidate: HOUR, tags: ['solana'] },
);

// ---------------------------------------------------------------------------
// Funding
// ---------------------------------------------------------------------------

/**
 * Projects are measured for funding in this many slices, each cached on its
 * own. One pass over every project's detail record is ~60 s — too long for
 * one request on most hosting plans — but a slice is ~10 s, and slices
 * refresh independently in the background once warm.
 */
const FUNDING_SLICES = 6;

const getFundingSlice = unstable_cache(
  async (slice: number): Promise<FundingRound[]> =>
    singleFlight(`funding:${slice}`, async () => {
      const projects = await getSolanaProjects();
      const mine = projects.filter((_, i) => i % FUNDING_SLICES === slice);
      // Through the per-project cache: a record fetched for funding also
      // serves that project's page, and a page visit warms funding.
      const settled = await mapSettledLimit(mine, 4, (p) => getProjectDetail(p.slug));
      return settled.flatMap((r) => (r.status === 'fulfilled' && r.value ? r.value.rounds : []));
    }),
  ['solana-funding-slice-v1'],
  { revalidate: 12 * HOUR, tags: ['solana', 'funding'] },
);

/**
 * Every disclosed round for a Solana project, newest first.
 *
 * Assembled from each project's own detail record: DefiLlama's global
 * funding feed is a paid endpoint, but the rounds it links to a protocol are
 * published with that protocol, free.
 */
const DEFILLAMA_KEY = process.env.DEFILLAMA_API_KEY ?? null;

/**
 * The complete Solana feed from DefiLlama's paid API, when a key is set.
 * One request instead of hundreds, and rounds for projects with no value
 * locked — which the free path cannot see at all.
 */
const getProFunding = unstable_cache(
  async (): Promise<FundingRound[]> =>
    singleFlight('funding:pro', async () => {
      const projects = await getSolanaProjects();
      const bySourceId = new Map<string, string>();
      for (const p of projects) for (const id of p.sourceIds) bySourceId.set(id, p.slug);
      return new DefiLlamaSolana().proRaises(DEFILLAMA_KEY!, (id) =>
        id ? (bySourceId.get(id) ?? null) : null,
      );
    }),
  ['solana-funding-pro-v1'],
  { revalidate: 6 * HOUR, tags: ['solana', 'funding'] },
);

/** Which funding source is live — shown on the pages that depend on it. */
export const FUNDING_SOURCE: 'defillama-pro' | 'defillama-protocols' = DEFILLAMA_KEY
  ? 'defillama-pro'
  : 'defillama-protocols';

export async function getFundingRounds(): Promise<FundingRound[]> {
  if (DEFILLAMA_KEY) {
    // A paid-feed failure falls back to the free assembly rather than to nothing.
    const pro = await getProFunding().catch(() => null);
    if (pro) return pro;
  }
  const slices = await Promise.all(
    Array.from({ length: FUNDING_SLICES }, (_, i) => getFundingSlice(i).catch(() => [])),
  );
  const seen = new Set<string>();
  return slices
    .flat()
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => b.date - a.date);
}

/**
 * Funding if it is ready within `waitMs`, else `null` — while assembly carries
 * on in the background.
 *
 * Pages whose main content does not depend on funding (the project database,
 * a project's profile) use this, so a cold funding cache costs them a column
 * of dashes for a minute rather than a minute of blank page.
 */
export async function getFundingRoundsIfReady(waitMs = 1500): Promise<FundingRound[] | null> {
  const pending = getFundingRounds();
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), waitMs));
  return Promise.race([pending, timeout]);
}

export async function getInvestors(): Promise<Investor[]> {
  return investorsFromRounds(await getFundingRounds());
}

export async function getInvestor(slug: string): Promise<Investor | null> {
  return (await getInvestors()).find((i) => i.slug === slug) ?? null;
}

// ---------------------------------------------------------------------------
// Joined views
// ---------------------------------------------------------------------------

export async function getProjectRows(): Promise<{ rows: ProjectRow[]; fundingReady: boolean }> {
  const [projects, markets, rounds] = await Promise.all([
    getSolanaProjects(),
    getMarketIndex(),
    getFundingRoundsIfReady(),
  ]);
  return { rows: projectRows(projects, markets, rounds ?? []), fundingReady: rounds !== null };
}

/** Source slug (a product or a family) → our project slug, for linking flow rankings. */
export async function getProjectSlugIndex(): Promise<Map<string, string>> {
  const projects = await getSolanaProjects();
  const index = new Map<string, string>();
  for (const p of projects) for (const s of p.sourceSlugs) index.set(s, p.slug);
  return index;
}

export interface EcosystemEvent {
  readonly date: number;
  readonly kind: 'milestone' | 'incident';
  readonly projectSlug: string;
  readonly projectName: string;
  readonly label: string;
  /** USD lost, for incidents. */
  readonly amount: number | null;
}

/**
 * Dated milestones and security incidents across every project.
 *
 * Read through the per-project detail cache, which the funding assembly has
 * usually warmed already — so this is mostly cache reads, not fetches.
 */
export const getEcosystemEvents = unstable_cache(
  async (): Promise<EcosystemEvent[]> =>
    singleFlight('events', async () => {
      const projects = await getSolanaProjects();
      const settled = await mapSettledLimit(projects, 8, (p) => getProjectDetail(p.slug));
      const events: EcosystemEvent[] = [];
      settled.forEach((r, i) => {
        if (r.status !== 'fulfilled' || !r.value) return;
        const p = projects[i]!;
        for (const e of r.value.events) {
          events.push({
            date: e.date,
            kind: 'milestone',
            projectSlug: p.slug,
            projectName: p.name,
            label: e.label,
            amount: null,
          });
        }
        for (const h of r.value.hacks) {
          if (!h.date) continue;
          events.push({
            date: h.date,
            kind: 'incident',
            projectSlug: p.slug,
            projectName: p.name,
            label: h.classification
              ? `Security incident: ${h.classification}`
              : 'Security incident',
            amount: h.amount,
          });
        }
      });
      return events.sort((a, b) => b.date - a.date);
    }),
  ['solana-events-v1'],
  { revalidate: 6 * HOUR, tags: ['solana'] },
);

/** Events if ready within `waitMs`, else `null` — assembly continues in the background. */
export async function getEcosystemEventsIfReady(waitMs = 1500): Promise<EcosystemEvent[] | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), waitMs));
  return Promise.race([getEcosystemEvents().catch(() => [] as EcosystemEvent[]), timeout]);
}

export interface ProjectFlows {
  readonly fees: {
    readonly d1: number | null;
    readonly d7: number | null;
    readonly d30: number | null;
  };
  readonly revenue: {
    readonly d1: number | null;
    readonly d7: number | null;
    readonly d30: number | null;
  };
}

/**
 * A project's fees and revenue on Solana, summed across every product line it
 * ships — Jupiter's aggregator, perps and lending each report their own.
 * `null` where no product reports the figure, never zero.
 */
export async function getProjectFlows(project: Project): Promise<ProjectFlows> {
  const [fees, revenue] = await Promise.all([
    getFlows('fees').catch(() => null),
    getFlows('revenue').catch(() => null),
  ]);
  const slugs = new Set(project.sourceSlugs);
  const sum = (flows: FlowTotals | null, key: 'total24h' | 'total7d' | 'total30d') => {
    const values = (flows?.entries ?? []).filter((e) => slugs.has(e.slug)).map((e) => e[key]);
    const present = values.filter((v): v is number => v !== null);
    return present.length ? present.reduce((a, b) => a + b, 0) : null;
  };
  return {
    fees: { d1: sum(fees, 'total24h'), d7: sum(fees, 'total7d'), d30: sum(fees, 'total30d') },
    revenue: {
      d1: sum(revenue, 'total24h'),
      d7: sum(revenue, 'total7d'),
      d30: sum(revenue, 'total30d'),
    },
  };
}

export interface StakePoolView extends StakePool {
  /** The pool token's on-chain market, for its name, symbol, icon and holders. */
  readonly token: TokenMarket | null;
}

/**
 * Liquid-staking pools, each joined to its token on Jupiter — which also
 * names the large pools Solana Compass lists without one.
 */
export const getStakePools = unstable_cache(
  async (): Promise<StakePoolView[]> =>
    singleFlight('staking', async () => {
      const pools = await new SolanaCompassStaking().pools();
      const mints = pools.map((p) => p.mint).filter((m): m is string => !!m);
      const tokens = await new SolanaMarkets().byMints(mints).catch(() => [] as TokenMarket[]);
      const byMint = new Map(tokens.map((t) => [t.mint!, t]));
      return pools.map((p) => ({ ...p, token: p.mint ? (byMint.get(p.mint) ?? null) : null }));
    }),
  ['solana-staking-v1'],
  { revalidate: HOUR, tags: ['solana'] },
);

export interface PriceHistory {
  /** The pool the prices are from: a token's price is always some pool's price. */
  readonly pool: PoolRef;
  readonly candles: readonly DailyCandle[];
  readonly fetchedAt: number;
}

/**
 * A token's daily price history from its deepest pool on GeckoTerminal.
 * Two requests per token, cached for an hour; `null` when it has no pool or
 * no candles. A failed request throws instead, so an outage or a rate limit
 * is retried on the next read rather than cached as "no history".
 */
export const getTokenPriceHistory = unstable_cache(
  async (mint: string): Promise<PriceHistory | null> =>
    singleFlight(`gt:${mint}`, async () => {
      const gt = new GeckoTerminal();
      const pools = await gt.pools(mint);
      const pool = pools[0];
      if (!pool) return null;
      const candles = await gt.daily(pool, 365);
      return candles.length ? { pool, candles, fetchedAt: Date.now() } : null;
    }),
  ['gt-price-history-v2'],
  { revalidate: HOUR, tags: ['solana'] },
);
