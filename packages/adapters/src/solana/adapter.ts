/**
 * Solana adapter — tokenized equities (xStocks, issued by Backed Finance).
 *
 * Data via Jupiter's public token API; shape verified live, see
 * docs/research/01-data-sources.md §5.
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

/** Mints per search request. Well inside any plausible query-length limit. */
const MINTS_PER_REQUEST = 50;

/** USDC on Solana — the quote currency for execution-cost simulation. */
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_DECIMALS = 6;

/**
 * What an xStock actually confers — per the issuer's own legal overview.
 *
 * `ownership: false` is the correction that matters. An xStock is a **bearer
 * debt instrument classified as a tracker certificate**: it gives economic
 * exposure to the underlying equity, secured by shares the issuer holds, but
 * the holder does not own the share. Calling that "ownership" would be exactly
 * the conflation this product exists to prevent — the difference only surfaces
 * when it matters most, in an issuer default.
 *
 * Dividends are passed through, but by reinvestment: the custodian receives the
 * cash and buys more of the same stock, and holder balances rise through a
 * multiplier rather than a payment.
 */
const TOKENIZED_EQUITY_RIGHTS = {
  ownership: false,
  dividends: true,
  voting: false,
  redeemable: true,
} as const;

interface WireQuote {
  outAmount?: string;
  inAmount?: string;
  priceImpactPct?: string;
}

interface WireToken {
  id: string;
  symbol?: string;
  name?: string;
  usdPrice?: number | string;
  liquidity?: number | string;
  mcap?: number | string;
  fdv?: number | string;
  holderCount?: number | string;
  stats24h?: WireStats;
  stats1h?: WireStats;
  /** ISO 8601. The venue's own view of when this price is from. */
  updatedAt?: string;
}

interface WireStats {
  priceChange?: number | string;
  buyVolume?: number | string;
  sellVolume?: number | string;
  /** Volume the venue classifies as organic. Their judgement, not ours. */
  buyOrganicVolume?: number | string;
  sellOrganicVolume?: number | string;
  numBuys?: number | string;
  numSells?: number | string;
}

/**
 * Organic volume for a window, or `null` when the venue did not classify it.
 *
 * `null` rather than `0`: an unclassified window is not a window with no
 * organic trading, and the difference decides whether the UI says "3% organic"
 * or says nothing. Zero is only returned when the venue actually reported it.
 */
function organicVolume(stats: WireStats | undefined): number | null {
  if (!stats) return null;
  const buy = num(stats.buyOrganicVolume);
  const sell = num(stats.sellOrganicVolume);
  if (buy === null && sell === null) return null;
  return (buy ?? 0) + (sell ?? 0);
}

function tradeCount(stats: WireStats | undefined): number | null {
  if (!stats) return null;
  const buys = num(stats.numBuys);
  const sells = num(stats.numSells);
  if (buys === null && sells === null) return null;
  return (buys ?? 0) + (sells ?? 0);
}

/** ISO 8601 to epoch ms, or `null` — never a silent fallback to our clock. */
function parseIsoMs(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
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
        // The mint is the identity. On a permissionless chain anyone can issue
        // a token called NVDAx; only this address is the issuer's.
        onchainAddress: seed.mint,
        redemption: {
          available: true,
          summary:
            'Redeemable with the issuer at 1:1 against the underlying share — but only from a whitelisted wallet. Primary-market access requires onboarding, KYC and AML with the issuer first. Everyone else exits by selling on-chain.',
          // The issuer sets minimums commercially rather than publishing one
          // per token, so we assert nothing we cannot source.
          minimumUsd: null,
        },
        eligibility:
          'Not marketed, offered or solicited in the United States, to U.S. Persons, or in any other prohibited jurisdiction. Issued under Jersey and EU frameworks; other jurisdictions may classify these differently.',
        backing:
          'Backed asset-by-asset by shares held with regulated custodians in segregated sub-accounts, with no commingling between products. Collateral sits under a three-party Account Control Agreement between the issuer, the custodian and an independent Security Agent.',
        sources: [
          { label: 'Issuer docs', url: 'https://docs.xstocks.fi/docs', kind: 'docs' as const },
          {
            label: 'Legal overview',
            url: 'https://docs.xstocks.fi/docs/product-legal-overview',
            kind: 'terms' as const,
          },
          {
            label: 'Issuance & redemption',
            url: 'https://docs.xstocks.fi/docs/issuance-and-redemption',
            kind: 'terms' as const,
          },
          {
            label: 'Prospectus & final terms',
            url: 'https://assets.backed.fi/legal-documentation',
            kind: 'attestation' as const,
          },
          {
            label: 'Mint on Solscan',
            url: `https://solscan.io/token/${seed.mint}`,
            kind: 'onchain' as const,
          },
        ],
      })),
    );
  }

  /**
   * Real round-trip cost of taking a position of this size, as a fraction.
   *
   * Simulated as two actual quotes — USDC in, then everything back out — rather
   * than read off `priceImpactPct`. Impact alone omits LP fees and routing
   * losses, which at these sizes are the larger half of the cost; and because
   * the second leg is quoted on the amount the first leg actually returns, the
   * result is the true cost of a round trip rather than two optimistic halves.
   *
   * Returns `null` if either leg cannot be routed, so the caller reports the
   * figure as unavailable instead of as free.
   */
  async fetchRoundTripCost(
    listing: Listing,
    notionalUsd: number,
    signal?: AbortSignal,
  ): Promise<number | null> {
    if (notionalUsd <= 0) return null;

    const quote = (inputMint: string, outputMint: string, amount: string) =>
      getJson<WireQuote>(
        `${this.config.apiUrl}/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}` +
          `&amount=${amount}&slippageBps=50&restrictIntermediateTokens=true`,
        { signal, revalidate: 60 },
      );

    try {
      const usdIn = BigInt(Math.round(notionalUsd * 10 ** USDC_DECIMALS));

      const buy = await quote(USDC_MINT, listing.venueSymbol, usdIn.toString());
      if (!buy?.outAmount) return null;

      const sell = await quote(listing.venueSymbol, USDC_MINT, buy.outAmount);
      if (!sell?.outAmount) return null;

      const usdBack = Number(sell.outAmount);
      if (!Number.isFinite(usdBack) || usdBack <= 0) return null;

      const cost = 1 - usdBack / Number(usdIn);
      // A negative round trip would mean the route is arbitrageable, which at
      // these sizes means stale routing rather than free money.
      return cost > 0 && cost < 1 ? cost : null;
    } catch {
      // Execution cost is supplementary; a failure here must not take down the
      // page's price data.
      return null;
    }
  }

  async fetchQuotes(signal?: AbortSignal): Promise<Quote[]> {
    const seeds = solanaListingSeeds();
    if (seeds.length === 0) return [];

    // Batched lookups rather than one request per token.
    //
    // Chunked because the endpoint's maximum query length is undocumented. A
    // text search returns at most 20 matches; an exact-mint query currently
    // returns all of them, but silently truncating here would drop venues from
    // the comparison with no error — the worst failure mode this product has.
    // Chunking costs one extra request per 50 listings and removes the risk.
    const mints = seeds.map((seed) => seed.mint);
    const chunks: string[][] = [];
    for (let i = 0; i < mints.length; i += MINTS_PER_REQUEST) {
      chunks.push(mints.slice(i, i + MINTS_PER_REQUEST));
    }

    let wire: WireToken[];
    try {
      const pages = await Promise.all(
        chunks.map((chunk) =>
          getJson<WireToken[]>(
            `${this.config.apiUrl}/tokens/v2/search?query=${encodeURIComponent(chunk.join(','))}`,
            { signal, revalidate: 15 },
          ),
        ),
      );
      wire = pages.flat();
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
        premium: null,
        impactPrices: null,
        organicVolume24h: organicVolume(token.stats24h),
        tradeCount24h: tradeCount(token.stats24h),
        tradeCount1h: tradeCount(token.stats1h),
        observedAt,
        venueObservedAt: parseIsoMs(token.updatedAt),
      });
    }

    return quotes;
  }
}
