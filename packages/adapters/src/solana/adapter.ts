/**
 * Solana adapter — tokenized equities (xStocks, issued by Backed Finance).
 *
 * Data via Jupiter's public token API; shape verified live, see
 * docs/research/02-data-sources.md §5.
 *
 * The contrast with Hyperliquid is the product thesis in miniature. A listing
 * here is a custody-backed SPL token: redeemable, 1:1 with a real share, no
 * leverage. The same ticker on Hyperliquid is a perp — leveraged price
 * exposure, no ownership. Surfacing that difference is why the catalog carries
 * `rights` per listing rather than per asset.
 *
 * Capability trade-off: Jupiter gives spot price, pool liquidity, FDV and
 * holder counts, but no OHLCV and no order book. `capabilities` says so, and
 * the UI renders accordingly instead of showing empty chart panels.
 */

import type { Listing, Quote, Venue } from '@marketroom/core';
import { listingIdFor, solanaListingSeeds } from '@marketroom/catalog';
import { getJson, num } from '../http';
import { VenueError, type VenueAdapter, type VenueCapabilities } from '../venue';

export interface SolanaConfig {
  readonly apiUrl: string;
  readonly tradeUrl: string;
}

export const DEFAULT_SOLANA_CONFIG: SolanaConfig = {
  apiUrl: 'https://lite-api.jup.ag',
  tradeUrl: 'https://jup.ag/swap',
};

const VENUE: Venue = {
  id: 'solana',
  name: 'Solana · xStocks',
  chain: 'Solana',
  tradeUrl: DEFAULT_SOLANA_CONFIG.tradeUrl,
};

const CAPABILITIES: VenueCapabilities = {
  candles: false,
  orderBook: false,
  realtime: false,
  openInterest: false,
  funding: false,
  liquidity: true,
  holders: true,
};

/** A custody-backed token: real ownership and redemption, but no votes. */
const TOKENIZED_EQUITY_RIGHTS = {
  ownership: true,
  dividends: true,
  voting: false,
  redeemable: true,
} as const;

interface WireToken {
  id: string;
  symbol?: string;
  name?: string;
  usdPrice?: number | string;
  liquidity?: number | string;
  mcap?: number | string;
  fdv?: number | string;
  holderCount?: number | string;
  stats24h?: {
    priceChange?: number | string;
    buyVolume?: number | string;
    sellVolume?: number | string;
  };
}

/**
 * Convert Jupiter's 24h price change into an absolute previous price.
 *
 * ⚠️ `stats*.priceChange` is a **percentage**, not a fraction — a value of
 * `1.19` means +1.19%, not +119%. Reading it as a fraction halves the implied
 * previous price and reports NVDA as up 108% on the day. Verified against the
 * live endpoint: NVDAx at $234.13 with `priceChange: 1.19` implies a previous
 * price of $231.38, which matches the same asset's +1.15% on Hyperliquid.
 *
 * We store an absolute previous price so every venue's 24h change is computed
 * by the same `core` derivation, rather than each adapter inventing its own.
 */
function previousPriceFrom(price: number, changePercent: number | null): number | null {
  if (changePercent === null) return null;
  const fraction = changePercent / 100;
  if (fraction <= -1) return null; // A -100% move leaves no previous price to infer.
  return price / (1 + fraction);
}

export class SolanaAdapter implements VenueAdapter {
  readonly venue = VENUE;
  readonly capabilities = CAPABILITIES;

  constructor(private readonly config: SolanaConfig = DEFAULT_SOLANA_CONFIG) {}

  /**
   * Listings come from the curated catalog rather than discovery: a symbol
   * search for "NVDA" on a permissionless chain returns impostor tokens
   * alongside the genuine Backed-issued one. Pinning the mint address in the
   * catalog is the only safe way to identify a listing, and on a product whose
   * entire premise is "the same ticker can hide very different things", guessing
   * would be indefensible.
   */
  listListings(): Promise<Listing[]> {
    return Promise.resolve(
      solanaListingSeeds().map((seed) => ({
        id: listingIdFor('solana', seed.mint),
        assetId: seed.assetId,
        venue: 'solana' as const,
        venueSymbol: seed.mint,
        kind: 'tokenized-equity' as const,
        maxLeverage: 1,
        rights: TOKENIZED_EQUITY_RIGHTS,
        issuer: seed.issuer,
        tradeUrl: `${this.config.tradeUrl}/USDC-${seed.mint}`,
      })),
    );
  }

  async fetchQuotes(signal?: AbortSignal): Promise<Quote[]> {
    const seeds = solanaListingSeeds();
    if (seeds.length === 0) return [];

    // One batched lookup rather than one request per token.
    const mints = seeds.map((seed) => seed.mint);
    let wire: WireToken[];

    try {
      wire = await getJson<WireToken[]>(
        `${this.config.apiUrl}/tokens/v2/search?query=${encodeURIComponent(mints.join(','))}`,
        { signal, revalidate: 15 },
      );
    } catch (error) {
      throw new VenueError('solana', 'Failed to fetch token quotes', error);
    }

    if (!Array.isArray(wire)) return [];

    const observedAt = Date.now();
    const quotes: Quote[] = [];

    for (const token of wire) {
      const price = num(token.usdPrice);
      if (price === null || !token.id) continue;

      const changePercent = num(token.stats24h?.priceChange);
      const buy = num(token.stats24h?.buyVolume) ?? 0;
      const sell = num(token.stats24h?.sellVolume) ?? 0;
      const volume = buy + sell;

      quotes.push({
        listingId: listingIdFor('solana', token.id),
        price,
        prevDayPrice: previousPriceFrom(price, changePercent),
        volume24h: volume > 0 ? volume : null,
        openInterest: null,
        liquidity: num(token.liquidity),
        fundingRate: null,
        oraclePrice: null,
        fdv: num(token.fdv) ?? num(token.mcap),
        holders: num(token.holderCount),
        observedAt,
      });
    }

    return quotes;
  }
}
