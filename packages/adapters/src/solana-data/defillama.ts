/**
 * DefiLlama — Solana projects, value locked, flows and funding.
 *
 * Free, unauthenticated endpoints only. Verified 2026-10-10:
 *
 *   /protocols                     every protocol, with per-chain TVL (~9 MB)
 *   /lite/protocols2               parent-protocol metadata (~7 MB)
 *   /updatedProtocol/{slug}        one protocol in full, funding rounds included
 *   /v2/historicalChainTvl/Solana  chain TVL, daily
 *   /overview/{fees,dexs}/solana   chain flows, per protocol
 *   stablecoins.llama.fi/stablecoincharts/Solana
 *
 * The global funding feed (`/raises`) became paid (HTTP 402). Rounds are still
 * embedded, free, in each protocol's detail record — which is where this
 * adapter reads them from.
 *
 * Payloads here are large. None of these fetches asks Next to cache the raw
 * response (its data cache rejects entries over 2 MB); callers cache the
 * small, Solana-only shapes returned from here instead.
 */

import type {
  FlowEntry,
  FlowTotals,
  FundingRound,
  Project,
  ProjectDetail,
  SeriesPoint,
} from '@marketroom/core';
import { slugify } from '@marketroom/core';
import { getJson, num } from '../http';

const API = 'https://api.llama.fi';
const STABLES = 'https://stablecoins.llama.fi';
const CHAIN = 'Solana';

/**
 * Categories that are not projects built on Solana. DefiLlama tracks
 * exchanges' custody wallets as "CEX" protocols; a centralised exchange
 * holding SOL is not a Solana project.
 */
const EXCLUDED_CATEGORIES = new Set(['CEX']);

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

interface WireProtocol {
  id?: string;
  name?: string;
  slug?: string;
  symbol?: string | null;
  category?: string | null;
  chains?: string[];
  tvl?: number | null;
  chainTvls?: Record<string, number>;
  change_1d?: number | null;
  change_7d?: number | null;
  gecko_id?: string | null;
  logo?: string | null;
  url?: string | null;
  twitter?: string | null;
  github?: string[] | null;
  description?: string | null;
  listedAt?: number | null;
  parentProtocol?: string | null;
  audits?: string | number | null;
  address?: string | null;
}

interface WireParent {
  id: string;
  name?: string;
  url?: string | null;
  description?: string | null;
  logo?: string | null;
  gecko_id?: string | null;
  twitter?: string | null;
  github?: string[] | null;
  symbol?: string | null;
  address?: string | null;
}

/** "solana:<mint>" → the mint; anything on another chain → null. */
const solanaMint = (address: string | null | undefined) =>
  address?.startsWith('solana:') ? address.slice('solana:'.length) || null : null;

interface WireRaise {
  date?: number;
  name?: string;
  round?: string | null;
  amount?: number | null;
  valuation?: number | string | null;
  category?: string | null;
  source?: string | null;
  leadInvestors?: string[] | null;
  otherInvestors?: string[] | null;
}

interface WireDetail {
  description?: string | null;
  chainTvls?: Record<string, { tvl?: { date: number; totalLiquidityUSD: number }[] }>;
  raises?: WireRaise[];
  hallmarks?: [number, string][];
  hacks?: { date?: number; amount?: number | null; classification?: string | null }[];
  audit_links?: string[] | null;
  address?: string | null;
}

interface WireHack {
  date?: number | null;
  name?: string | null;
  classification?: string | null;
  technique?: string | null;
  amount?: number | null;
  chain?: string[] | null;
  targetType?: string | null;
  returnedFunds?: number | null;
  defillamaId?: string | number | null;
  parentProtocolId?: string | null;
}

/** A security incident as DefiLlama's hacks database records it. */
export interface SolanaHack {
  /** The victim, as DefiLlama names it. */
  readonly name: string;
  /** Unix ms, at day precision. */
  readonly date: number;
  /** USD lost; `null` when not reported. */
  readonly amount: number | null;
  /** "Key Compromise", "Oracle Manipulation"… */
  readonly classification: string | null;
  readonly technique: string | null;
  readonly targetType: string | null;
  /** USD recovered; `null` when none is recorded. */
  readonly returnedFunds: number | null;
  /** DefiLlama's protocol id, when it tracks the victim. */
  readonly defillamaId: string | null;
  /** `parent#…`, when the protocol belongs to a family. */
  readonly parentProtocolId: string | null;
}

interface WireFlowOverview {
  total24h?: number | null;
  total7d?: number | null;
  total30d?: number | null;
  change_1d?: number | null;
  totalDataChart?: [number, number][];
  protocols?: {
    name?: string;
    displayName?: string;
    slug?: string;
    logo?: string | null;
    category?: string | null;
    total24h?: number | null;
    total7d?: number | null;
    total30d?: number | null;
    change_1d?: number | null;
    change_7d?: number | null;
  }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pct = (value: unknown) => {
  const n = num(value);
  return n === null ? null : n / 100;
};

const secondsToMs = (value: unknown) => {
  const n = num(value);
  return n === null ? null : n * 1000;
};

/** DefiLlama states round sizes and valuations in millions of USD. */
const millions = (value: unknown) => {
  const n = num(value);
  return n === null || n <= 0 ? null : n * 1e6;
};

/** Trimmed, or `null` — including DefiLlama's "-" placeholder for "none". */
const nonEmpty = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed && trimmed !== '-' ? trimmed : null;
};

/** The protocol's value locked on Solana itself — not on every chain it touches. */
const solanaTvl = (p: WireProtocol) => num(p.chainTvls?.[CHAIN]);

function sumOrNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

/** TVL-weighted change across a family's products. */
function weightedChange(
  members: WireProtocol[],
  pick: (p: WireProtocol) => unknown,
): number | null {
  let weight = 0;
  let total = 0;
  for (const m of members) {
    const change = pct(pick(m));
    const tvl = num(m.tvl);
    if (change === null || tvl === null || tvl <= 0) continue;
    weight += tvl;
    total += tvl * change;
  }
  return weight > 0 ? total / weight : null;
}

export function mapRaise(raise: WireRaise, projectSlug: string | null): FundingRound | null {
  const date = secondsToMs(raise.date);
  const projectName = nonEmpty(raise.name);
  if (date === null || !projectName) return null;
  const round = nonEmpty(raise.round);
  return {
    id: `${slugify(projectName)}-${date}-${slugify(round ?? 'round')}`,
    date,
    projectName,
    projectSlug,
    round,
    amount: millions(raise.amount),
    valuation: millions(raise.valuation),
    category: nonEmpty(raise.category),
    leadInvestors: (raise.leadInvestors ?? []).map((s) => s.trim()).filter(Boolean),
    otherInvestors: (raise.otherInvestors ?? []).map((s) => s.trim()).filter(Boolean),
    source: nonEmpty(raise.source),
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class DefiLlamaSolana {
  constructor(private readonly options: { signal?: AbortSignal } = {}) {}

  /**
   * Every project on Solana, one per team.
   *
   * DefiLlama lists each product line as its own protocol — Jupiter's
   * aggregator, perps and lending are three entries under one parent. A
   * research database is about the team, so families are rolled up into one
   * project: TVL summed, change TVL-weighted, metadata from the parent.
   */
  async projects(): Promise<Project[]> {
    const [protocols, lite] = await Promise.all([
      getJson<WireProtocol[]>(`${API}/protocols`, {
        signal: this.options.signal,
        timeoutMs: 30_000,
      }),
      getJson<{ parentProtocols?: WireParent[] }>(`${API}/lite/protocols2?b=2`, {
        signal: this.options.signal,
        timeoutMs: 30_000,
      }),
    ]);

    const parents = new Map((lite.parentProtocols ?? []).map((p) => [p.id, p]));
    const families = new Map<string, WireProtocol[]>();
    for (const p of protocols) {
      if (!p.chains?.includes(CHAIN) || !p.slug || !p.name) continue;
      if (EXCLUDED_CATEGORIES.has(p.category ?? '')) continue;
      const key = p.parentProtocol ?? `self:${p.slug}`;
      const family = families.get(key) ?? [];
      family.push(p);
      families.set(key, family);
    }

    const projects: Project[] = [];
    for (const [key, members] of families) {
      members.sort((a, b) => (solanaTvl(b) ?? 0) - (solanaTvl(a) ?? 0));
      const lead = members[0]!;
      const parent = key.startsWith('parent#') ? parents.get(key) : undefined;
      const slug = parent ? key.slice('parent#'.length) : lead.slug!;
      const listed = members
        .map((m) => secondsToMs(m.listedAt))
        .filter((t): t is number => t !== null);
      const audits = members.map((m) => num(m.audits)).filter((a): a is number => a !== null);

      projects.push({
        slug,
        name: nonEmpty(parent?.name) ?? lead.name!,
        logo: nonEmpty(parent?.logo)?.replace(/\?.*$/, '') ?? nonEmpty(lead.logo),
        description: nonEmpty(parent?.description) ?? nonEmpty(lead.description),
        category: nonEmpty(lead.category),
        tags: [
          ...new Set(
            members.map((m) => nonEmpty(m.category)).filter((c): c is string => c !== null),
          ),
        ],
        chains: [...new Set(members.flatMap((m) => m.chains ?? []))],
        links: {
          website: nonEmpty(parent?.url) ?? nonEmpty(lead.url),
          twitter: nonEmpty(parent?.twitter) ?? nonEmpty(lead.twitter),
          github: [
            ...new Set([...(parent?.github ?? []), ...members.flatMap((m) => m.github ?? [])]),
          ],
        },
        symbol: nonEmpty(parent?.symbol) ?? nonEmpty(lead.symbol),
        geckoId:
          nonEmpty(parent?.gecko_id) ??
          members.map((m) => nonEmpty(m.gecko_id)).find(Boolean) ??
          null,
        tokenMint:
          solanaMint(parent?.address) ??
          members.map((m) => solanaMint(m.address)).find(Boolean) ??
          null,
        tvlSolana: sumOrNull(members.map(solanaTvl)),
        tvlTotal: sumOrNull(members.map((m) => num(m.tvl))),
        tvlChange1d: weightedChange(members, (m) => m.change_1d),
        tvlChange7d: weightedChange(members, (m) => m.change_7d),
        listedAt: listed.length ? Math.min(...listed) : null,
        parentSlug: null,
        sourceIds: [
          ...(parent ? [parent.id] : []),
          ...members.map((m) => m.id).filter((id): id is string => !!id),
        ],
        sourceSlugs: [slug, ...members.map((m) => m.slug!).filter((s) => s !== slug)],
        audits: audits.length ? Math.max(...audits) : null,
        products:
          members.length > 1
            ? members.map((m) => ({
                name: m.name!,
                category: nonEmpty(m.category),
                tvlSolana: solanaTvl(m),
              }))
            : [],
      });
    }
    return projects;
  }

  /** What only the project's own record carries: history, rounds, events. */
  async detail(slug: string): Promise<ProjectDetail> {
    const d = await getJson<WireDetail>(`${API}/updatedProtocol/${encodeURIComponent(slug)}`, {
      signal: this.options.signal,
      timeoutMs: 30_000,
    });
    const series = (d.chainTvls?.[CHAIN]?.tvl ?? [])
      .map((p) => ({ t: p.date * 1000, v: p.totalLiquidityUSD }))
      .filter((p) => Number.isFinite(p.v));
    const address = nonEmpty(d.address);
    return {
      slug,
      description: nonEmpty(d.description),
      tvlSeries: series,
      rounds: (d.raises ?? [])
        .map((r) => mapRaise(r, slug))
        .filter((r): r is FundingRound => r !== null)
        .sort((a, b) => b.date - a.date),
      events: (d.hallmarks ?? [])
        .filter((h) => Array.isArray(h) && typeof h[0] === 'number')
        .map(([date, label]) => ({ date: date * 1000, label: String(label) }))
        .sort((a, b) => b.date - a.date),
      hacks: (d.hacks ?? []).map((h) => ({
        date: (h.date ?? 0) * 1000,
        amount: num(h.amount),
        classification: nonEmpty(h.classification),
      })),
      auditLinks: (d.audit_links ?? []).filter((l) => /^https?:\/\//.test(l)),
      tokenMint: address?.startsWith('solana:') ? address.slice('solana:'.length) : null,
    };
  }

  /**
   * Every Solana-tagged round from DefiLlama's paid API — the complete feed,
   * including projects with no value locked. Needs an API-plan key.
   *
   * `projectSlugFor` maps DefiLlama's protocol id on a round (`"2141"`,
   * `"parent#jupiter"`) to one of our project slugs; rounds for projects we
   * do not list keep their name and no link.
   */
  async proRaises(
    apiKey: string,
    projectSlugFor: (defillamaId: string | null) => string | null,
  ): Promise<FundingRound[]> {
    const d = await getJson<{
      raises?: (WireRaise & { chains?: string[]; defillamaId?: string | null })[];
    }>(`https://pro-api.llama.fi/${encodeURIComponent(apiKey)}/api/raises`, {
      signal: this.options.signal,
      timeoutMs: 30_000,
    });
    return (d.raises ?? [])
      .filter((r) => r.chains?.includes(CHAIN))
      .map((r) => mapRaise(r, projectSlugFor(r.defillamaId ?? null)))
      .filter((r): r is FundingRound => r !== null)
      .sort((a, b) => b.date - a.date);
  }

  /**
   * Security incidents that touched Solana, from DefiLlama's hacks database.
   *
   * Free: `/hacks` returned 1,299 rows across chains on 2026-10-10, 54 of
   * them on Solana. Rows carry no source link of their own, so callers cite
   * the database page (`https://defillama.com/hacks`).
   */
  async hacks(): Promise<SolanaHack[]> {
    const rows = await getJson<WireHack[]>(`${API}/hacks`, {
      signal: this.options.signal,
      timeoutMs: 30_000,
    });
    const out: SolanaHack[] = [];
    for (const r of Array.isArray(rows) ? rows : []) {
      const date = secondsToMs(r.date);
      const name = nonEmpty(r.name);
      if (!r.chain?.includes(CHAIN) || date === null || date <= 0 || !name) continue;
      const amount = num(r.amount);
      const returned = num(r.returnedFunds);
      out.push({
        name,
        date,
        amount: amount !== null && amount > 0 ? amount : null,
        classification: nonEmpty(r.classification),
        technique: nonEmpty(r.technique),
        targetType: nonEmpty(r.targetType),
        returnedFunds: returned !== null && returned > 0 ? returned : null,
        defillamaId:
          r.defillamaId === null || r.defillamaId === undefined ? null : String(r.defillamaId),
        parentProtocolId: nonEmpty(r.parentProtocolId),
      });
    }
    return out.sort((a, b) => b.date - a.date);
  }

  /** Value locked on Solana, daily. */
  async chainTvl(): Promise<SeriesPoint[]> {
    const rows = await getJson<{ date: number; tvl: number }[]>(
      `${API}/v2/historicalChainTvl/${CHAIN}`,
      { signal: this.options.signal },
    );
    return rows.map((r) => ({ t: r.date * 1000, v: r.tvl })).filter((p) => Number.isFinite(p.v));
  }

  /** Stablecoins circulating on Solana, in USD, daily. */
  async stablecoins(): Promise<SeriesPoint[]> {
    const rows = await getJson<
      { date: string | number; totalCirculatingUSD?: Record<string, number> }[]
    >(`${STABLES}/stablecoincharts/${CHAIN}`, { signal: this.options.signal, timeoutMs: 20_000 });
    return rows
      .map((r) => ({
        t: Number(r.date) * 1000,
        v: Object.values(r.totalCirculatingUSD ?? {}).reduce((a, b) => a + (Number(b) || 0), 0),
      }))
      .filter((p) => Number.isFinite(p.t) && p.v > 0);
  }

  /** Fees, revenue or DEX volume on Solana, with each protocol's share. */
  async flows(kind: 'fees' | 'revenue' | 'dexs'): Promise<FlowTotals> {
    const path =
      kind === 'dexs'
        ? `${API}/overview/dexs/${CHAIN.toLowerCase()}`
        : `${API}/overview/fees/${CHAIN.toLowerCase()}${kind === 'revenue' ? '?dataType=dailyRevenue&' : '?'}`;
    const url = `${path}${path.includes('?') ? '' : '?'}excludeTotalDataChartBreakdown=true`;
    const d = await getJson<WireFlowOverview>(url, {
      signal: this.options.signal,
      timeoutMs: 30_000,
    });
    const entries: FlowEntry[] = (d.protocols ?? [])
      .filter((p) => num(p.total24h) !== null || num(p.total30d) !== null)
      .map((p) => ({
        slug: p.slug ?? slugify(p.name ?? ''),
        name: nonEmpty(p.displayName) ?? p.name ?? '',
        logo: nonEmpty(p.logo),
        category: nonEmpty(p.category),
        total24h: num(p.total24h),
        total7d: num(p.total7d),
        total30d: num(p.total30d),
        change1d: pct(p.change_1d),
        change7d: pct(p.change_7d),
      }))
      .sort((a, b) => (b.total24h ?? 0) - (a.total24h ?? 0));
    return {
      total24h: num(d.total24h),
      total7d: num(d.total7d),
      total30d: num(d.total30d),
      change1d: pct(d.change_1d),
      series: (d.totalDataChart ?? []).map(([t, v]) => ({ t: t * 1000, v })),
      entries,
    };
  }
}
