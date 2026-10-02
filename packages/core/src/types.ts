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
 * What kind of thing the underlying is. The reference had no such concept and
 * consequently mixed NVDA, GOLD and EUR into one undifferentiated list.
 */
export const ASSET_CLASSES = ['equity', 'index', 'etf', 'commodity', 'fx', 'crypto'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

/**
 * Two-level taxonomy, replacing the reference's 49 flat freeform strings
 * (`Semiconductors`, `Semiconductors (Memory)`, `Semiconductor Equipment`, …
 * were all separate top-level buckets).
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
 * a missing metric as 0 would be a lie, which the reference's methodology
 * section is right to warn against.
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
  /** Epoch ms when this quote was observed. */
  readonly observedAt: number;
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
