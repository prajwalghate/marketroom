/**
 * Core domain entities.
 *
 * The central modelling decision: an **Asset** (the underlying company or
 * instrument) is separate from a **Listing** (one tradable claim on that asset,
 * on one venue). One asset has many listings.
 *
 *   Asset "NVDA"
 *    ├── Listing hyperliquid:xyz:NVDA   perp, leveraged exposure, no ownership
 *    └── Listing solana:NVDAx           SPL token, custody-backed, redeemable
 *
 * This is what makes Marketroom an aggregator rather than a single-venue screen:
 * the same ticker can hide very different products, and the model makes that
 * difference first-class instead of a footnote.
 *
 * This package is pure. It has no dependencies and performs no I/O.
 */

// ---------------------------------------------------------------------------
// Venues
// ---------------------------------------------------------------------------

export const VENUES = ['hyperliquid', 'solana'] as const;
export type VenueId = (typeof VENUES)[number];

export interface Venue {
  readonly id: VenueId;
  readonly name: string;
  /** Settlement/execution chain, for display. */
  readonly chain: string;
  /** Where a user actually trades this venue's listings. */
  readonly tradeUrl: string;
}

// ---------------------------------------------------------------------------
// Asset — the underlying. Venue-independent.
// ---------------------------------------------------------------------------

/**
 * What kind of thing the underlying is. Without this, NVDA, GOLD and EUR end up
 * in one undifferentiated list, and no filter or aggregate means anything.
 */
export const ASSET_CLASSES = ['equity', 'index', 'etf', 'commodity', 'fx', 'crypto'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

/**
 * Two-level taxonomy. A flat list turns `Semiconductors`,
 * `Semiconductors (Memory)` and `Semiconductor Equipment` into three unrelated
 * top-level buckets, so neither filtering nor sector aggregates hold together.
 */
export interface Taxonomy {
  readonly sector: string;
  readonly industry: string;
}

export interface Asset {
  /** Stable canonical id, lowercase. Join key for everything. e.g. `nvda`. */
  readonly id: string;
  /** Canonical display ticker. e.g. `NVDA`. */
  readonly symbol: string;
  /** Full legal/display name. e.g. `NVIDIA Corporation`. */
  readonly name: string;
  readonly assetClass: AssetClass;
  readonly taxonomy: Taxonomy;
  /** ISO-3166 alpha-2, or a joined list for duals. `null` for non-national assets. */
  readonly country: string | null;
  /** Editorial explainer. The curated layer no API provides. */
  readonly summary: string;
  /** Canonical ids of related assets, powering "related markets". */
  readonly peers: readonly string[];
  /** Private / pre-IPO companies have no public float, so no meaningful P/E. */
  readonly isPrivate: boolean;
  /** Indicative trailing P/E. `null` is meaningful — never invent a number. */
  readonly peRatio: number | null;
}

// ---------------------------------------------------------------------------
// Listing — one tradable claim, on one venue.
// ---------------------------------------------------------------------------

/**
 * The legal/economic shape of the instrument. This is the distinction the
 * Marketroom brand thesis exists to surface: the same ticker can be a
 * leveraged derivative or a custody-backed claim, and they are not the same
 * product.
 */
export const INSTRUMENT_KINDS = ['perpetual', 'tokenized-equity', 'spot'] as const;
export type InstrumentKind = (typeof INSTRUMENT_KINDS)[number];

export interface HolderRights {
  /** Does holding confer ownership of the underlying share? */
  readonly ownership: boolean;
  /** Dividend entitlement or economic equivalent. */
  readonly dividends: boolean;
  /** Voting rights. */
  readonly voting: boolean;
  /** Can it be redeemed for the underlying (or its cash value)? */
  readonly redeemable: boolean;
}

/** A link to something authoritative about a listing. */
export interface SourceLink {
  readonly label: string;
  readonly url: string;
  /**
   * `onchain` links resolve an address on an explorer and are the only ones a
   * reader can verify without trusting us or the issuer.
   */
  readonly kind: 'issuer' | 'terms' | 'attestation' | 'onchain' | 'docs';
}

/**
 * What it takes to actually convert this listing back into the underlying.
 *
 * A boolean is not enough. "Redeemable" with a $100k minimum, KYC, and a
 * jurisdiction restriction is a different product from "redeemable" without
 * them, and the difference is exactly what a holder needs to know before
 * buying rather than after.
 */
export interface RedemptionTerms {
  readonly available: boolean;
  /** Plain-English description of the process. */
  readonly summary: string;
  /** Minimum redeemable size in USD, where the issuer sets one. */
  readonly minimumUsd: number | null;
}

export interface Listing {
  /** Globally unique: `${venue}:${venueSymbol}`. e.g. `hyperliquid:xyz:NVDA`. */
  readonly id: string;
  /** Canonical asset id this listing is a claim on. */
  readonly assetId: string;
  readonly venue: VenueId;
  /** The venue's own identifier. e.g. `xyz:NVDA` or the Solana mint address. */
  readonly venueSymbol: string;
  readonly kind: InstrumentKind;
  /** Max leverage. `1` for spot/token listings. */
  readonly maxLeverage: number;
  readonly rights: HolderRights;
  /** Issuer, for custody-backed tokens. `null` for derivatives. */
  readonly issuer: string | null;
  /** Deep link to trade this specific listing. */
  readonly tradeUrl: string;

  /**
   * The venue's own on-chain identifier for this listing, where one exists —
   * a Solana mint address, say.
   *
   * Shown verbatim and linked to an explorer, because on a permissionless
   * chain the ticker is not the identity. Anyone can mint a token called
   * `NVDAx`; only one address is the issuer's. Letting a reader check the
   * address is the difference between trusting us and verifying.
   */
  readonly onchainAddress: string | null;

  /** How to get back to the underlying. `null` for instruments that cannot. */
  readonly redemption: RedemptionTerms | null;

  /** Who may actually hold or redeem this. `null` when unrestricted or unknown. */
  readonly eligibility: string | null;

  /**
   * What stands behind the instrument, if anything.
   *
   * A perp is backed by nothing — it settles against an oracle. A tracker
   * certificate is backed by real shares in segregated custody. Neither is
   * ownership, so `rights.ownership` alone cannot express the difference, and
   * the difference is the whole question in an issuer default.
   */
  readonly backing: string | null;

  /**
   * What someone other than the holder can do to this position, unilaterally.
   *
   * Rights say what you are owed; this says what can be done to you. For a
   * Token-2022 xStock it is the issuer's live on-chain keys — freeze, pause,
   * and a permanent delegate able to move or burn tokens in any wallet. For a
   * HIP-3 perp it is the deployer's power to halt the market and settle every
   * position at the mark. `null` when no one holds such a power, or it is not
   * known — never as a reassurance we have not checked.
   */
  readonly controls: string | null;

  /** Authoritative links — issuer, terms, attestations, explorer. */
  readonly sources: readonly SourceLink[];
}

// ---------------------------------------------------------------------------
// Quote — live market state for one listing.
// ---------------------------------------------------------------------------

/**
 * All numbers here are real `number`s. Upstream APIs return stringly-typed
 * numerics; adapters parse them exactly once at the boundary so that no
 * `Number()` call ever happens at render time.
 *
 * `null` means "this venue does not provide this metric" — not zero. Rendering
 * a missing metric as 0 is a lie, and on financial data an expensive one.
 */
export interface Quote {
  readonly listingId: string;
  /** Last traded / mark price in USD. */
  readonly price: number;
  /** Price 24h ago, for change computation. */
  readonly prevDayPrice: number | null;
  /** 24h notional volume in USD. */
  readonly volume24h: number | null;
  /** Open interest in USD. Derivatives only. */
  readonly openInterest: number | null;
  /** On-chain pool liquidity in USD. Token listings only. */
  readonly liquidity: number | null;
  /** Current funding rate, per hour, as a fraction. Perps only. */
  readonly fundingRate: number | null;
  /** Oracle reference price, where the venue publishes one. */
  readonly oraclePrice: number | null;
  /** Fully diluted valuation in USD. Token listings only. */
  readonly fdv: number | null;
  /** Distinct on-chain holders. Token listings only. */
  readonly holders: number | null;

  /**
   * Venue-published divergence of mark from oracle, as a fraction. Perps only.
   *
   * This is the venue's own number, not ours. Hyperliquid computes it as part
   * of funding and publishes it in the same payload as the price — we were
   * already fetching it and throwing it away.
   */
  readonly premium: number | null;

  /**
   * Venue-published `[bid, ask]` impact prices — what a notional-sized order
   * would actually fill at, as opposed to the mid. Perps only.
   *
   * The gap between these and `price` is the honest cost of the first real
   * trade, and it is the cheapest depth signal available: it arrives free in
   * the quote payload, where a book snapshot would be a request per market.
   */
  readonly impactPrices: readonly [number, number] | null;

  /**
   * 24h volume the venue classifies as organic, in USD. Token listings only.
   *
   * Kept separate from `volume24h` rather than replacing it, because the two
   * routinely differ by more than an order of magnitude and which one you are
   * looking at matters. This is the venue's classification, not ours — label
   * it as theirs wherever it is shown.
   */
  readonly organicVolume24h: number | null;

  /** Trades in the last 24h / 1h. Token listings only. Recency, not size. */
  readonly tradeCount24h: number | null;
  readonly tradeCount1h: number | null;

  /** Epoch ms when *we* observed this quote. Always our own clock. */
  readonly observedAt: number;

  /**
   * Epoch ms the *venue* says the price is from, where it says so at all.
   *
   * Deliberately separate from `observedAt`, and deliberately nullable.
   * Hyperliquid's `allMids` and `metaAndAssetCtxs` carry no timestamp of any
   * kind, so for perps this is `null` and the UI must say it does not know.
   * Defaulting it to our poll time would render "updated 3s ago" over a price
   * that last moved hours ago — reassurance exactly where the product cannot
   * afford to be wrong.
   */
  readonly venueObservedAt: number | null;
}

// ---------------------------------------------------------------------------
// Candles & book
// ---------------------------------------------------------------------------

export const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'] as const;
export type Interval = (typeof INTERVALS)[number];

export interface Candle {
  /** Bar open time, epoch ms. */
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface BookLevel {
  readonly price: number;
  readonly size: number;
  /** Number of resting orders at this level, where the venue reports it. */
  readonly count: number | null;
}

export interface OrderBook {
  readonly listingId: string;
  readonly bids: readonly BookLevel[];
  readonly asks: readonly BookLevel[];
  readonly observedAt: number;
}

export interface Trade {
  readonly listingId: string;
  readonly price: number;
  readonly size: number;
  readonly side: 'buy' | 'sell';
  readonly time: number;
  readonly id: string;
}

// ---------------------------------------------------------------------------
// Composed views
// ---------------------------------------------------------------------------

/** An asset together with every listing of it and their live quotes. */
export interface AssetView {
  readonly asset: Asset;
  readonly listings: readonly ListingQuote[];
}

export interface ListingQuote {
  readonly listing: Listing;
  readonly quote: Quote | null;
}

/**
 * Health of one venue's data in the current snapshot. Surfaced in the UI so a
 * degraded venue is visibly degraded rather than silently missing — an
 * aggregator that hides a dead source is worse than one that has none.
 */
export interface VenueStatus {
  readonly venue: VenueId;
  readonly ok: boolean;
  readonly listingCount: number;
  readonly fetchedAt: number;
  readonly latencyMs: number;
  readonly error: string | null;
}

/** Everything the index page needs, in one object. */
export interface MarketSnapshot {
  readonly assets: readonly AssetView[];
  readonly venues: readonly VenueStatus[];
  readonly generatedAt: number;
}

// ---------------------------------------------------------------------------
// Chart ranges
// ---------------------------------------------------------------------------

/**
 * A selectable window of price history.
 *
 * Each range pairs a lookback with an interval chosen to keep the bar count in
 * a readable band — roughly 150–400 bars. A 1-year window at 1h would be 8,760
 * bars: slower to fetch, slower to draw, and illegible at chart width.
 */
export interface CandleRange {
  readonly id: string;
  /** Short label for the control. */
  readonly label: string;
  /** Spoken form, since "1D" alone is ambiguous to a screen reader. */
  readonly description: string;
  readonly interval: Interval;
  readonly lookbackMs: number;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const CANDLE_RANGES: readonly CandleRange[] = [
  { id: '1d', label: '1D', description: 'Past day', interval: '5m', lookbackMs: DAY },
  { id: '1w', label: '1W', description: 'Past week', interval: '1h', lookbackMs: 7 * DAY },
  { id: '1m', label: '1M', description: 'Past month', interval: '4h', lookbackMs: 30 * DAY },
  { id: '3m', label: '3M', description: 'Past 3 months', interval: '1d', lookbackMs: 90 * DAY },
  { id: '1y', label: '1Y', description: 'Past year', interval: '1d', lookbackMs: 365 * DAY },
];

/** The range the page server-renders, so the first paint needs no request. */
export const DEFAULT_CANDLE_RANGE = '1w';

export const candleRangeById = (id: string): CandleRange | undefined =>
  CANDLE_RANGES.find((range) => range.id === id);
