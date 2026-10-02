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

import type { Candle, Interval, Listing, OrderBook, Quote, Venue } from '@marketroom/core';
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
        'Nothing. This is a synthetic contract that settles in USDC against an oracle price — no share is held anywhere on your behalf. You are exposed to the oracle, the deployer and liquidation.',
      sources: [
        { label: 'Venue', url: this.config.tradeUrl, kind: 'issuer' },
        { label: 'Market specifications', url: 'https://docs.trade.xyz', kind: 'docs' },
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
        observedAt,
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

  async fetchOrderBook(listing: Listing, signal?: AbortSignal): Promise<OrderBook> {
    try {
      const wire = await this.infoRequest<WireBook>(
        { type: 'l2Book', coin: listing.venueSymbol },
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
