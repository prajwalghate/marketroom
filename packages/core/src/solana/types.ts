/**
 * Solana research platform — domain entities.
 *
 * A **Project** is something being built on Solana. It may or may not have a
 * token, and may or may not hold value we can measure; those are separate,
 * optional facts about it rather than prerequisites for being listed.
 *
 * Every figure is nullable. `null` means "no source reports this" — never
 * zero. A project with no tracked TVL is not a project with $0 locked, and a
 * research product that renders the one as the other is wrong in exactly the
 * way it exists to prevent.
 *
 * Pure. No I/O.
 */

export interface ProjectLinks {
  readonly website: string | null;
  /** Handle without the @. */
  readonly twitter: string | null;
  /** GitHub organisations or users. */
  readonly github: readonly string[];
}

export interface Project {
  /** URL slug. Stable join key across pages. */
  readonly slug: string;
  readonly name: string;
  readonly logo: string | null;
  readonly description: string | null;
  /** The primary category — that of the largest product. */
  readonly category: string | null;
  /** Every category across the project's products, largest first. Filters match any. */
  readonly tags: readonly string[];
  /** Every chain the project runs on. Solana is always one of them. */
  readonly chains: readonly string[];
  readonly links: ProjectLinks;
  /** Ticker, where the project has a token. */
  readonly symbol: string | null;
  /** CoinGecko id — a secondary join key to market data. */
  readonly geckoId: string | null;
  /** The token's Solana mint — the primary, exact join key to market data. */
  readonly tokenMint: string | null;
  /** Value locked on Solana specifically, USD. */
  readonly tvlSolana: number | null;
  /** Value locked across every chain, USD. */
  readonly tvlTotal: number | null;
  /** TVL change, as fractions. */
  readonly tvlChange1d: number | null;
  readonly tvlChange7d: number | null;
  /** Epoch ms the source first listed it. A proxy for "recently added". */
  readonly listedAt: number | null;
  /** Slug of the parent project, for product families (Jupiter → Jupiter Perps). */
  readonly parentSlug: string | null;
  /**
   * The source's own ids for this project and every product in it — how a
   * funding round that names a product (`defillamaId: "2141"`) or a family
   * (`"parent#jupiter"`) is joined back to the project page.
   */
  readonly sourceIds: readonly string[];
  /** The source's slugs for the same — how flow rankings (fees, DEX volume) link back. */
  readonly sourceSlugs: readonly string[];
  /** Number of security audits the source records. */
  readonly audits: number | null;
  /**
   * The product lines a team ships under one name — Jupiter's aggregator,
   * perps and lending are one project with three products. Largest first.
   */
  readonly products: readonly ProjectProduct[];
}

export interface ProjectProduct {
  readonly name: string;
  readonly category: string | null;
  readonly tvlSolana: number | null;
}

/** What only a project's own detail record carries. Fetched per page. */
export interface ProjectDetail {
  readonly slug: string;
  readonly description: string | null;
  /** Value locked on Solana over time, daily. */
  readonly tvlSeries: readonly SeriesPoint[];
  readonly rounds: readonly FundingRound[];
  /** Dated milestones the source records: launches, incidents, migrations. */
  readonly events: readonly { readonly date: number; readonly label: string }[];
  readonly hacks: readonly {
    readonly date: number;
    readonly amount: number | null;
    readonly classification: string | null;
  }[];
  /** Audit report links. */
  readonly auditLinks: readonly string[];
  /** Token mint on Solana, where the source records one. */
  readonly tokenMint: string | null;
}

/**
 * Live market data for a token.
 *
 * Primary source is Jupiter — Solana-native, free, and the only one of the
 * free sources with holder counts, liquidity and an organic-volume score.
 * CoinGecko fills ATH and a 7-day sparkline when a key is configured; without
 * one those stay `null` and empty rather than being fetched from a keyless
 * tier that rate-limits within a handful of calls.
 */
export interface TokenMarket {
  /** Join key: the Solana mint where known, else `cg:<coingecko id>`. */
  readonly key: string;
  readonly mint: string | null;
  readonly geckoId: string | null;
  readonly symbol: string;
  readonly name: string;
  readonly image: string | null;
  readonly price: number | null;
  readonly marketCap: number | null;
  readonly fdv: number | null;
  readonly volume24h: number | null;
  readonly change1h: number | null;
  readonly change24h: number | null;
  readonly change7d: number | null;
  readonly circulatingSupply: number | null;
  readonly totalSupply: number | null;
  readonly maxSupply: number | null;
  readonly ath: number | null;
  readonly athDate: number | null;
  /** On-chain liquidity across the token's pools, USD. */
  readonly liquidity: number | null;
  readonly holders: number | null;
  readonly traders24h: number | null;
  /** The venue's 0–100 organic-activity score. Their judgement, labelled as theirs. */
  readonly organicScore: number | null;
  readonly verified: boolean | null;
  /** Epoch ms the token was created. */
  readonly createdAt: number | null;
  /** Hourly closes over the last 7 days, oldest first. Empty without CoinGecko. */
  readonly sparkline: readonly number[];
  readonly updatedAt: number | null;
  /** Mint decimals, where the provider reports them. */
  readonly decimals: number | null;
  /** The owning token program: the classic SPL program or Token-2022. */
  readonly tokenProgram: string | null;
}

/** One disclosed funding round. */
export interface FundingRound {
  /** Stable id: project + date + round. */
  readonly id: string;
  /** Epoch ms. */
  readonly date: number;
  readonly projectName: string;
  /** Matched project, where the round belongs to one we list. */
  readonly projectSlug: string | null;
  /** "Seed", "Series A", "Strategic"… `null` when undisclosed. */
  readonly round: string | null;
  /** USD. `null` when undisclosed — common, and never zero. */
  readonly amount: number | null;
  readonly valuation: number | null;
  readonly category: string | null;
  readonly leadInvestors: readonly string[];
  readonly otherInvestors: readonly string[];
  /** Announcement URL, where the source gives one. */
  readonly source: string | null;
}

/** An investor, as seen through the rounds it took part in. */
export interface Investor {
  readonly slug: string;
  readonly name: string;
  /** Rounds it took part in, newest first. */
  readonly rounds: readonly FundingRound[];
  readonly leadCount: number;
  /** Distinct projects backed. */
  readonly portfolioCount: number;
  /** Sum of disclosed round sizes it took part in — not its own cheque size. */
  readonly roundVolume: number;
  readonly firstDeal: number | null;
  readonly lastDeal: number | null;
}

/** A point in a time series. */
export interface SeriesPoint {
  /** Epoch ms. */
  readonly t: number;
  readonly v: number;
}

/** One protocol's line in a fees, revenue or volume ranking. */
export interface FlowEntry {
  readonly slug: string;
  readonly name: string;
  readonly logo: string | null;
  readonly category: string | null;
  readonly total24h: number | null;
  readonly total7d: number | null;
  readonly total30d: number | null;
  readonly change1d: number | null;
  readonly change7d: number | null;
}

/** Chain-wide flows for a period. */
export interface FlowTotals {
  readonly total24h: number | null;
  readonly total7d: number | null;
  readonly total30d: number | null;
  readonly change1d: number | null;
  readonly series: readonly SeriesPoint[];
  readonly entries: readonly FlowEntry[];
}

export interface FearGreed {
  readonly value: number;
  readonly label: string;
  readonly at: number;
}

/** Everything the overview page draws, from one assembly. */
export interface SolanaOverview {
  readonly sol: TokenMarket | null;
  readonly tvl: { readonly current: number | null; readonly series: readonly SeriesPoint[] };
  readonly stablecoins: {
    readonly current: number | null;
    readonly series: readonly SeriesPoint[];
  };
  readonly dexVolume: FlowTotals | null;
  readonly fees: FlowTotals | null;
  readonly revenue: FlowTotals | null;
  readonly fearGreed: FearGreed | null;
  readonly generatedAt: number;
}

/** A liquid-staking pool: SOL staked through it, and what it charges. */
export interface StakePool {
  /** Stake-pool account address. */
  readonly address: string;
  /** The liquid staking token's mint. */
  readonly mint: string | null;
  /** The source's name. Missing for some large pools; callers fill it from the token. */
  readonly name: string | null;
  readonly website: string | null;
  readonly logo: string | null;
  /** SOL staked through the pool. */
  readonly solStaked: number | null;
  /** Annualised yield from the pool token's exchange rate, as a fraction. */
  readonly apy: number | null;
  /** Fees as fractions. `null` when the pool does not report one. */
  readonly epochFee: number | null;
  readonly depositFee: number | null;
  readonly withdrawFee: number | null;
  readonly validators: number | null;
  /** The source flags pools whose figures have not updated recently. */
  readonly stale: boolean;
  readonly updatedAt: number | null;
}
