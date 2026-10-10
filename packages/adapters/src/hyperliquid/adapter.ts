/**
 * Hyperliquid adapter — HIP-3 tokenized equity perps on trade[XYZ].
 *
 * Endpoint behaviour verified live; see docs/research/01-data-sources.md §1.
 *
 * ⚠️ The single most important detail in this file: equity markets do NOT live
 * on the default perp universe. Omitting `dex: "xyz"` returns 234 *crypto*
 * markets and zero equities — a silent wrong-data failure rather than an error.
 * Every request here goes through `infoRequest`, which always injects the dex,
 * so that mistake cannot be made by accident.
 */

import type {
  Candle,
  DepthProbe,
  Interval,
  Listing,
  OrderBook,
  Quote,
  Venue,
} from '@marketroom/core';
import { bookSpread, fillsFromBook, PROBE_SIZES_USD } from '@marketroom/core';
import { listingIdFor, resolveAssetId } from '@marketroom/catalog';
import { getJson, num, postJson, requireNum } from '../http';
import { VenueError, type VenueAdapter, type VenueCapabilities } from '../venue';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface HyperliquidConfig {
  readonly apiUrl: string;
  readonly dex: string;
  readonly tradeUrl: string;
}

export const DEFAULT_HYPERLIQUID_CONFIG: HyperliquidConfig = {
  apiUrl: 'https://api.hyperliquid.xyz',
  dex: 'xyz',
  tradeUrl: 'https://app.trade.xyz',
};

const VENUE: Venue = {
  id: 'hyperliquid',
  name: 'trade[XYZ]',
  chain: 'Hyperliquid (HIP-3)',
  tradeUrl: DEFAULT_HYPERLIQUID_CONFIG.tradeUrl,
};

const CAPABILITIES: VenueCapabilities = {
  candles: true,
  orderBook: true,
  realtime: true,
  openInterest: true,
  funding: true,
  liquidity: false, // Perps have no AMM pool; depth comes from the order book.
  holders: false,
};

/**
 * Perps confer price exposure only. Spelling this out per-venue is the point of
 * the product: the same ticker on Solana is a custody-backed claim with very
 * different rights.
 */
const PERP_RIGHTS = {
  ownership: false,
  dividends: false,
  voting: false,
  redeemable: false,
} as const;

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

interface WireUniverseEntry {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  isDelisted?: boolean;
}

interface WireAssetCtx {
  markPx: string;
  midPx?: string;
  oraclePx?: string;
  prevDayPx?: string;
  openInterest?: string;
  dayNtlVlm?: string;
  funding?: string;
  /** Mark-vs-oracle divergence, as a fraction. Published, not derived by us. */
  premium?: string;
  /** `[bid, ask]` impact prices — the fill for a notional-sized order. */
  impactPxs?: [string, string] | string[];
}

/**
 * Normalises the venue's impact prices to a `[bid, ask]` pair of numbers.
 *
 * Returns `null` on anything unexpected rather than a partial pair: a depth
 * signal that is half-parsed is worse than one that is absent, because the UI
 * would render it as though it were whole.
 */
function impactPair(raw: readonly string[] | undefined): readonly [number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const bid = num(raw[0]);
  const ask = num(raw[1]);
  if (bid === null || ask === null) return null;
  return [bid, ask];
}

interface WireCandle {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
}

interface WireBookLevel {
  px: string;
  sz: string;
  n?: number;
}

interface WireBook {
  coin: string;
  time: number;
  levels: [WireBookLevel[], WireBookLevel[]];
}

/** Candle interval mapping. Our vocabulary is a subset of Hyperliquid's. */
const INTERVAL_MAP: Record<Interval, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
};

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class HyperliquidAdapter implements VenueAdapter {
  readonly venue = VENUE;
  readonly capabilities = CAPABILITIES;

  constructor(private readonly config: HyperliquidConfig = DEFAULT_HYPERLIQUID_CONFIG) {}

  /**
   * The only way this adapter talks to the network. Injecting `dex` here rather
   * than at each call site is what guarantees we never silently query the
   * crypto universe instead of the equity one.
   */
  private infoRequest<T>(body: Record<string, unknown>, signal?: AbortSignal, revalidate?: number) {
    return postJson<T>(
      `${this.config.apiUrl}/info`,
      { ...body, dex: this.config.dex },
      { signal, ...(revalidate !== undefined ? { revalidate } : {}) },
    );
  }

  /** Strip the `xyz:` namespace to get a displayable ticker. */
  private static bareSymbol(venueSymbol: string): string {
    const separator = venueSymbol.indexOf(':');
    return separator === -1 ? venueSymbol : venueSymbol.slice(separator + 1);
  }

  private toListing(entry: WireUniverseEntry): Listing | null {
    const ticker = HyperliquidAdapter.bareSymbol(entry.name);
    const assetId = resolveAssetId('hyperliquid', ticker);
    // Unmapped markets are skipped rather than crashing the snapshot. CI's
    // catalog-coverage check is what stops this becoming permanent drift.
    if (!assetId) return null;

    return {
      id: listingIdFor('hyperliquid', entry.name),
      assetId,
      venue: 'hyperliquid',
      venueSymbol: entry.name,
      kind: 'perpetual',
      maxLeverage: entry.maxLeverage,
      rights: PERP_RIGHTS,
      issuer: null,
      // Verified against the live app: markets are selected by query
      // parameter, not by path. `/trade/NVDA` returns 404.
      tradeUrl: `${this.config.tradeUrl}/?market=${encodeURIComponent(ticker)}`,
      // A perp settles in USDC against an oracle. There is no share behind it
      // and no address to inspect — which is the distinction this field exists
      // to make visible rather than leave implied.
      onchainAddress: null,
      redemption: null,
      eligibility:
        'Derivatives trading is restricted in several jurisdictions, including the United States. Eligibility is determined by the venue, not by this index.',
      backing:
        "Nothing. This is a synthetic contract that settles in USDC against an oracle price — no share is held anywhere on your behalf. On weekends and US holidays that oracle follows this market's own order book (a 30-minute average) rather than any stock exchange.",
      // HIP-3: the deployer defines the oracle and holds `haltTrading`, which
      // per Hyperliquid's docs cancels all orders and settles positions to the
      // current mark price.
      controls:
        "The market's deployer sets the oracle and can halt trading, which cancels every order and settles every open position at the current mark price.",
      sources: [
        { label: 'Venue', url: this.config.tradeUrl, kind: 'issuer' },
        { label: 'Market specifications', url: 'https://docs.trade.xyz', kind: 'docs' },
        {
          label: 'Oracle methodology',
          url: 'https://docs.trade.xyz/perpetuals/mechanics/oracle-price',
          kind: 'docs',
        },
        {
          label: 'HIP-3 documentation',
          url: 'https://hyperliquid.gitbook.io/hyperliquid-docs',
          kind: 'docs',
        },
      ],
    };
  }

  async listListings(signal?: AbortSignal): Promise<Listing[]> {
    const [meta] = await this.metaAndContexts(signal);
    return meta.universe
      .filter((entry) => !entry.isDelisted)
      .flatMap((entry) => {
        const listing = this.toListing(entry);
        return listing ? [listing] : [];
      });
  }

  private async metaAndContexts(
    signal?: AbortSignal,
  ): Promise<[{ universe: WireUniverseEntry[] }, WireAssetCtx[]]> {
    try {
      const response = await this.infoRequest<[{ universe: WireUniverseEntry[] }, WireAssetCtx[]]>(
        { type: 'metaAndAssetCtxs' },
        signal,
        15,
      );
      if (!Array.isArray(response) || response.length !== 2) {
        throw new Error('Unexpected metaAndAssetCtxs shape');
      }
      return response;
    } catch (error) {
      throw new VenueError('hyperliquid', 'Failed to fetch market metadata', error);
    }
  }

  /**
   * One request returns the whole venue: 129 markets, ~57 KB, ~250 ms.
   *
   * ⚠️ `universe[i]` and `contexts[i]` are positionally aligned — there is no
   * key to join on. Any filtering must happen after the zip, never before.
   */
  async fetchQuotes(signal?: AbortSignal): Promise<Quote[]> {
    const [meta, contexts] = await this.metaAndContexts(signal);
    const observedAt = Date.now();
    const quotes: Quote[] = [];

    meta.universe.forEach((entry, index) => {
      const context = contexts[index];
      if (!context || entry.isDelisted) return;

      const listing = this.toListing(entry);
      if (!listing) return;

      const price = num(context.midPx) ?? num(context.markPx);
      if (price === null) return;

      // `openInterest` is denominated in base units; the UI wants USD.
      const openInterestBase = num(context.openInterest);

      quotes.push({
        listingId: listing.id,
        price,
        prevDayPrice: num(context.prevDayPx),
        volume24h: num(context.dayNtlVlm),
        openInterest: openInterestBase === null ? null : openInterestBase * price,
        liquidity: null,
        fundingRate: num(context.funding),
        oraclePrice: num(context.oraclePx),
        fdv: null,
        holders: null,
        premium: num(context.premium),
        impactPrices: impactPair(context.impactPxs),
        organicVolume24h: null,
        tradeCount24h: null,
        tradeCount1h: null,
        observedAt,
        // Neither `allMids` nor `metaAndAssetCtxs` carries a timestamp of any
        // kind. Substituting `observedAt` here would turn our poll clock into
        // a claim about the venue's price age, which is the one thing a
        // freshness indicator must never do.
        venueObservedAt: null,
      });
    });

    return quotes;
  }

  async fetchCandles(
    listing: Listing,
    interval: Interval,
    lookbackMs: number,
    signal?: AbortSignal,
  ): Promise<Candle[]> {
    const endTime = Date.now();
    try {
      const wire = await this.infoRequest<WireCandle[]>(
        {
          type: 'candleSnapshot',
          req: {
            coin: listing.venueSymbol,
            interval: INTERVAL_MAP[interval],
            startTime: endTime - lookbackMs,
            endTime,
          },
        },
        signal,
        30,
      );

      if (!Array.isArray(wire)) return [];

      return wire.map((candle) => ({
        time: candle.t,
        open: requireNum(candle.o, 'open'),
        high: requireNum(candle.h, 'high'),
        low: requireNum(candle.l, 'low'),
        close: requireNum(candle.c, 'close'),
        volume: num(candle.v) ?? 0,
      }));
    } catch (error) {
      throw new VenueError(
        'hyperliquid',
        `Failed to fetch candles for ${listing.venueSymbol}`,
        error,
      );
    }
  }

  /**
   * L2 book, 20 levels a side.
   *
   * `nSigFigs` asks the venue to aggregate levels into price buckets, which
   * trades precision for reach: at full precision NVDA's 20 levels span 0.08%
   * of price, at 3 significant figures they span ~8% and hold 20× the size.
   */
  async fetchOrderBook(
    listing: Listing,
    signal?: AbortSignal,
    nSigFigs?: 2 | 3 | 4 | 5,
  ): Promise<OrderBook> {
    try {
      const wire = await this.infoRequest<WireBook>(
        { type: 'l2Book', coin: listing.venueSymbol, ...(nSigFigs ? { nSigFigs } : {}) },
        signal,
      );

      const mapLevels = (levels: WireBookLevel[] | undefined) =>
        (levels ?? []).flatMap((level) => {
          const price = num(level.px);
          const size = num(level.sz);
          return price === null || size === null ? [] : [{ price, size, count: level.n ?? null }];
        });

      return {
        listingId: listing.id,
        bids: mapLevels(wire.levels?.[0]),
        asks: mapLevels(wire.levels?.[1]),
        observedAt: wire.time ?? Date.now(),
      };
    } catch (error) {
      throw new VenueError('hyperliquid', `Failed to fetch book for ${listing.venueSymbol}`, error);
    }
  }

  /**
   * What an order of each size would fill at, walked against the live book.
   *
   * Full precision first: it is exact for every order it can absorb. Only
   * sizes it cannot absorb are re-walked against aggregated books, finest
   * first, and those fills are marked `book-aggregated` — each bucket is priced
   * at its far edge, so they overstate the cost slightly, never understate it.
   * Most liquid markets never need the second request.
   */
  async probeDepth(
    listing: Listing,
    sizes: readonly number[] = PROBE_SIZES_USD,
    signal?: AbortSignal,
  ): Promise<DepthProbe> {
    const measuredAt = Date.now();
    const book = await this.fetchOrderBook(listing, signal);
    const spread = bookSpread(book);
    const base = {
      listingId: listing.id,
      venue: 'hyperliquid' as const,
      measuredAt,
      source: 'Hyperliquid order book (l2Book)',
      lastTradeAt: null,
    };

    if (!spread) {
      return {
        ...base,
        displayedPrice: null,
        fills: sizes.flatMap((notionalUsd) =>
          (['buy', 'sell'] as const).map((side) => ({
            side,
            notionalUsd,
            price: null,
            method: 'book' as const,
            failure: 'no-liquidity' as const,
          })),
        ),
      };
    }

    let fills = fillsFromBook(book, spread.mid, 'book', sizes);
    for (const nSigFigs of [4, 3] as const) {
      if (!fills.some((f) => f.failure === 'insufficient-depth')) break;
      const coarse = fillsFromBook(
        await this.fetchOrderBook(listing, signal, nSigFigs),
        spread.mid,
        'book-aggregated',
        sizes,
      );
      fills = fills.map((fill) =>
        fill.failure !== 'insufficient-depth'
          ? fill
          : (coarse.find(
              (c) => c.side === fill.side && c.notionalUsd === fill.notionalUsd && c.price !== null,
            ) ?? fill),
      );
    }

    return { ...base, displayedPrice: spread.mid, fills };
  }

  /**
   * Epoch ms of the most recent trade, or `null` if the venue returned none.
   *
   * Ten times the rate-limit weight of a book request, so it is fetched for a
   * market someone is looking at, not swept across the index.
   */
  async fetchLastTradeAt(listing: Listing, signal?: AbortSignal): Promise<number | null> {
    try {
      const trades = await this.infoRequest<{ time?: number }[]>(
        { type: 'recentTrades', coin: listing.venueSymbol },
        signal,
      );
      if (!Array.isArray(trades) || trades.length === 0) return null;
      const latest = Math.max(...trades.map((t) => (typeof t.time === 'number' ? t.time : 0)));
      return latest > 0 ? latest : null;
    } catch (error) {
      throw new VenueError(
        'hyperliquid',
        `Failed to fetch trades for ${listing.venueSymbol}`,
        error,
      );
    }
  }

  /** Diagnostic: lists the builder-deployed DEXs, used by the catalog tooling. */
  async listPerpDexs(signal?: AbortSignal): Promise<string[]> {
    const response = await getJson<unknown>(`${this.config.apiUrl}/info`, { signal }).catch(
      () => null,
    );
    if (Array.isArray(response)) {
      return response.flatMap((dex) =>
        dex && typeof dex === 'object' && 'name' in dex ? [String(dex.name)] : [],
      );
    }
    return [];
  }
}
