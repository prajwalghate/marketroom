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

import type { DepthProbe, Fill, FillFailure, Listing, Quote, Side, Venue } from '@marketroom/core';
import { PROBE_SIZES_USD } from '@marketroom/core';
import { listingIdFor, solanaListingSeeds } from '@marketroom/catalog';
import { getJson, HttpError, mapSettledLimit, num, postJson } from '../http';
import { VenueError, type VenueAdapter, type VenueCapabilities } from '../venue';

export interface SolanaConfig {
  readonly apiUrl: string;
  readonly tradeUrl: string;
  /** JSON-RPC endpoint, used only to read each mint's UI multiplier. Optional for callers. */
  readonly rpcUrl?: string;
}

export const DEFAULT_SOLANA_CONFIG: SolanaConfig = {
  apiUrl: 'https://lite-api.jup.ag',
  tradeUrl: 'https://jup.ag/swap',
  rpcUrl: 'https://api.mainnet-beta.solana.com',
};

const DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com';

/**
 * Tried in order after the configured endpoint. Public RPCs throttle and stall
 * without warning, and a multiplier read that fails leaves every listing on
 * the venue unmeasured, so a second, independent provider is worth carrying.
 */
const FALLBACK_RPC_URLS = ['https://solana-rpc.publicnode.com'];

/**
 * How long multipliers are reused. They move on a split or a dividend, a few
 * times a year per token, so re-reading them every measurement pass would put
 * a slow, rate-limited RPC on the critical path for nothing.
 */
const MULTIPLIER_TTL_MS = 30 * 60 * 1000;
let multipliersReadAt = 0;

/** Accounts per `getMultipleAccounts` call — the RPC method's own limit. */
const ACCOUNTS_PER_RPC = 100;

interface WireScaledUi {
  multiplier?: string | number;
  newMultiplier?: string | number;
  newMultiplierEffectiveTimestamp?: string | number;
}

interface WireMintAccount {
  data?: {
    parsed?: {
      info?: { extensions?: { extension?: string; state?: WireScaledUi }[] };
    };
  };
}

/**
 * Last multipliers successfully read, per mint.
 *
 * They change on a split or a dividend — a few times a year — so a value from
 * minutes ago is still right, while assuming 1 after an RPC blip would put
 * NFLXx out by a factor of ten. Process-local, like the snapshot's fallback.
 */
const lastMultipliers = new Map<string, number>();

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

/** A quote came back without an amount — no usable route at this size. */
class RouteUnavailable extends Error {
  constructor() {
    super('No usable route');
    this.name = 'RouteUnavailable';
  }
}

/**
 * Jupiter's answers when there is nothing to route through, as opposed to a
 * request that failed. Verified live: a token with no pool returns HTTP 400
 * "The token … is not tradable"; a pair with no path returns
 * `COULD_NOT_FIND_ANY_ROUTE`.
 */
const NO_ROUTE = /not tradable|COULD_NOT_FIND_ANY_ROUTE|NO_ROUTES_FOUND|no routes? found/i;

/**
 * What a failed quote says about the market.
 *
 * Only an explicit "no route" is a market fact. Timeouts, 5xx and 429 are
 * facts about our request, and reading them as an empty market would publish
 * a false verdict at exactly the moment the venue is under load.
 */
function routeFailure(error: unknown): FillFailure {
  if (error instanceof RouteUnavailable) return 'no-liquidity';
  if (error instanceof HttpError && error.status === 400 && NO_ROUTE.test(error.body)) {
    return 'no-liquidity';
  }
  return 'error';
}

function failedLadder(sizes: readonly number[], failure: FillFailure): Fill[] {
  return (['buy', 'sell'] as const).flatMap((side) =>
    sizes.map((notionalUsd) => ({
      side,
      notionalUsd,
      price: null,
      method: 'route' as const,
      failure,
    })),
  );
}

interface WireToken {
  id: string;
  decimals?: number | string;
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
        // Corrected 2026-10-06 against the base prospectus and the issuer's
        // redemption docs: the legal claim is to cash at the market price, not
        // to the share. An earlier version of this text said "1:1 against the
        // underlying share", which overstated the product in exactly the way
        // this field exists to prevent.
        redemption: {
          available: true,
          summary:
            'Redeemable with the issuer for stablecoins at the market price, from a whitelisted wallet after KYC and AML, with a $5,000 minimum. Holders are owed cash, not shares: delivery of the shares themselves is offered only to clients also onboarded with Alpaca. Everyone else exits by selling on-chain.',
          // "Minimum transaction size: $5,000" — the issuer's Market Flow terms.
          minimumUsd: 5_000,
        },
        eligibility:
          'Not marketed, offered or solicited in the United States, to U.S. Persons, or in any other prohibited jurisdiction. Issued under Jersey and EU frameworks; other jurisdictions may classify these differently.',
        backing:
          'Backed asset-by-asset by shares held with custodians and brokers in segregated accounts, pledged to an independent Security Agent for holders. The terms allow the shares to be lent out against cash collateral. Reserve figures are published by the issuer.',
        // Read from the mint account on-chain, identical across all 41 xStock
        // mints when verified on 2026-10-06: Token-2022 with a freeze
        // authority, a pause authority and a permanent delegate.
        controls:
          'The issuer holds live keys on this token: it can freeze any wallet, pause every transfer, and — through a Token-2022 permanent delegate — move or burn tokens in any account. Its legal documents describe narrower uses (sanctions, court orders, security incidents), but the keys themselves are not limited to them.',
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
            label: 'Proof of reserves',
            url: 'https://defi.xstocks.fi/proof-of-reserves',
            kind: 'attestation' as const,
          },
          {
            label: 'Redemption terms',
            url: 'https://docs.xstocks.fi/docs/issuance-and-redemption/market-flow',
            kind: 'terms' as const,
          },
          {
            label: 'Mint & authorities on Solscan',
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

  /**
   * The multiplier each mint applies to displayed balances, read on-chain.
   *
   * xStocks are Token-2022 mints with a `scaledUiAmountConfig`: dividends and
   * splits are passed through by scaling what a balance *displays* rather than
   * by minting. After NFLX's 10-for-1 split one raw NFLXx unit displays as
   * ten. Swap quotes are denominated in raw units while displayed prices are
   * per scaled unit, so a fill computed without this is wrong by the full
   * multiplier — an earlier version of this probe reported NFLXx as a 928%
   * gap that did not exist.
   *
   * A mint whose multiplier cannot be read is left out of the result, and its
   * fills are reported as unmeasured. Never defaulted to 1.
   */
  private async uiMultipliers(
    mints: readonly string[],
    signal?: AbortSignal,
  ): Promise<Map<string, number>> {
    const found = new Map<string, number>();
    const nowSeconds = Date.now() / 1000;
    const endpoints = [this.config.rpcUrl ?? DEFAULT_RPC_URL, ...FALLBACK_RPC_URLS];
    for (let i = 0; i < mints.length; i += ACCOUNTS_PER_RPC) {
      const chunk = mints.slice(i, i + ACCOUNTS_PER_RPC);
      const body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'getMultipleAccounts',
        params: [chunk, { encoding: 'jsonParsed' }],
      };
      let response: { result?: { value?: (WireMintAccount | null)[] } } | null = null;
      for (const endpoint of endpoints) {
        try {
          // Short and unretried: the next provider is a better retry than
          // waiting out the same stalled one.
          response = await postJson(endpoint, body, { signal, retries: 0, timeoutMs: 3_000 });
          if (response?.result?.value) break;
        } catch {
          response = null;
        }
      }
      if (!response?.result?.value) throw new Error('No RPC endpoint returned mint accounts');
      response.result?.value?.forEach((account, index) => {
        const info = account?.data?.parsed?.info;
        if (!info) return; // Unparsed or missing: unknown, not 1.
        const scaled = info.extensions?.find((e) => e.extension === 'scaledUiAmountConfig')?.state;
        // A parsed mint with no scaling extension displays its raw amount.
        if (!scaled) return void found.set(chunk[index]!, 1);
        const current = num(scaled.multiplier);
        const next = num(scaled.newMultiplier);
        const effectiveAt = num(scaled.newMultiplierEffectiveTimestamp);
        const multiplier =
          next !== null && effectiveAt !== null && effectiveAt <= nowSeconds ? next : current;
        if (multiplier !== null && multiplier > 0) found.set(chunk[index]!, multiplier);
      });
    }
    return found;
  }

  /**
   * What a swap of each size would fill at, both directions, routed live.
   *
   * One token lookup first, for decimals and the displayed price — captured in
   * the same pass as the fills, so the comparison between them is not skewed
   * by fifteen seconds of cache. Then a routed quote per size and side.
   *
   * Sizes are walked smallest first and a side stops at its first failure: if
   * $100 cannot route, $1,000 cannot either, and asking would only spend rate
   * limit to learn nothing. A dead listing costs two requests, not eight.
   */
  async probeDepths(
    listings: readonly Listing[],
    sizes: readonly number[] = PROBE_SIZES_USD,
    options: { signal?: AbortSignal; concurrency?: number } = {},
  ): Promise<DepthProbe[]> {
    // Four listings at a time, each walking its two sides in parallel: eight
    // quotes in flight at most. Jupiter's free tier rate-limits sustained
    // bursts, and a 429 here is a listing reported as unmeasured.
    const { signal, concurrency = 4 } = options;
    if (listings.length === 0) return [];

    const tokens = new Map<string, WireToken>();
    for (let i = 0; i < listings.length; i += MINTS_PER_REQUEST) {
      const mints = listings.slice(i, i + MINTS_PER_REQUEST).map((l) => l.venueSymbol);
      const page = await getJson<WireToken[]>(
        `${this.config.apiUrl}/tokens/v2/search?query=${encodeURIComponent(mints.join(','))}`,
        { signal },
      );
      for (const token of Array.isArray(page) ? page : []) tokens.set(token.id, token);
    }

    const stale = Date.now() - multipliersReadAt > MULTIPLIER_TTL_MS;
    const unread = listings.some((l) => !lastMultipliers.has(l.venueSymbol));
    if (stale || unread) {
      try {
        const read = await this.uiMultipliers(
          listings.map((l) => l.venueSymbol),
          signal,
        );
        for (const [mint, multiplier] of read) lastMultipliers.set(mint, multiplier);
        multipliersReadAt = Date.now();
      } catch {
        // Fall through to the last values read; mints never read stay unmeasured.
      }
    }

    // Circuit breaker. Once the venue answers 429, every further quote in this
    // pass would be refused too — and sending them anyway extends the ban.
    // The rest of the pass is reported unmeasured without being requested.
    let throttled = false;

    const settled = await mapSettledLimit(listings, concurrency, async (listing) => {
      const token = tokens.get(listing.venueSymbol);
      const displayedPrice = num(token?.usdPrice);
      const decimals = num(token?.decimals);
      const multiplier = lastMultipliers.get(listing.venueSymbol) ?? null;
      const measuredAt = Date.now();
      const base = {
        listingId: listing.id,
        venue: 'solana' as const,
        displayedPrice,
        measuredAt,
        source: 'Jupiter swap quotes (USDC ↔ token)',
        lastTradeAt: null,
      };

      // Without decimals, a price or the multiplier, a fill cannot be put in
      // the units the displayed price uses. That is a gap in our measurement,
      // not a fact about the market.
      if (
        displayedPrice === null ||
        displayedPrice <= 0 ||
        decimals === null ||
        multiplier === null
      ) {
        return { ...base, fills: failedLadder(sizes, 'error') };
      }

      const scale = 10 ** decimals;
      const unit = { scale, multiplier };
      const walkSide = async (side: Side): Promise<Fill[]> => {
        const fills: Fill[] = [];
        let stopped: FillFailure | null = null;
        for (const notionalUsd of sizes) {
          if (stopped || throttled) {
            fills.push({
              side,
              notionalUsd,
              price: null,
              method: 'route',
              failure: stopped ?? 'error',
            });
            continue;
          }
          try {
            const price =
              side === 'buy'
                ? await this.routedBuy(listing.venueSymbol, notionalUsd, unit, signal)
                : await this.routedSell(
                    listing.venueSymbol,
                    notionalUsd / displayedPrice,
                    unit,
                    signal,
                  );
            fills.push({ side, notionalUsd, price, method: 'route', failure: null });
          } catch (error) {
            if (error instanceof HttpError && error.status === 429) throttled = true;
            const failure = routeFailure(error);
            fills.push({ side, notionalUsd, price: null, method: 'route', failure });
            // Only a market fact ends the walk. A transient error at $1k says
            // nothing about $10k.
            if (failure !== 'error') stopped = failure;
          }
        }
        return fills;
      };

      const [buys, sells] = await Promise.all([walkSide('buy'), walkSide('sell')]);
      return { ...base, fills: [...buys, ...sells] };
    });

    return settled.map((result, index) =>
      result.status === 'fulfilled'
        ? result.value
        : {
            listingId: listings[index]!.id,
            venue: 'solana' as const,
            displayedPrice: null,
            fills: failedLadder(sizes, 'error'),
            measuredAt: Date.now(),
            source: 'Jupiter swap quotes (USDC ↔ token)',
            lastTradeAt: null,
          },
    );
  }

  private quote(inputMint: string, outputMint: string, amount: bigint, signal?: AbortSignal) {
    return getJson<WireQuote>(
      `${this.config.apiUrl}/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}` +
        `&amount=${amount}&slippageBps=50&restrictIntermediateTokens=true`,
      // One retry, not the default two: a probe is one of hundreds, and a slow
      // answer is worth less than a fast "could not measure". A 429 is still
      // retried once by the HTTP layer; after that the breaker stops the pass.
      { signal, retries: 1, timeoutMs: 6_000 },
    );
  }

  /**
   * USD per *displayed* token for spending `notionalUsd` of USDC.
   *
   * The quote returns raw base units; a holder sees raw × multiplier.
   */
  private async routedBuy(
    mint: string,
    notionalUsd: number,
    unit: { scale: number; multiplier: number },
    signal?: AbortSignal,
  ) {
    const usdcIn = BigInt(Math.round(notionalUsd * 10 ** USDC_DECIMALS));
    const quote = await this.quote(USDC_MINT, mint, usdcIn, signal);
    const rawOut = num(quote?.outAmount);
    if (rawOut === null || rawOut <= 0) throw new RouteUnavailable();
    return notionalUsd / ((rawOut / unit.scale) * unit.multiplier);
  }

  /** USD per *displayed* token for selling `units` displayed tokens into USDC. */
  private async routedSell(
    mint: string,
    units: number,
    unit: { scale: number; multiplier: number },
    signal?: AbortSignal,
  ) {
    const rawIn = BigInt(Math.max(1, Math.round((units / unit.multiplier) * unit.scale)));
    const quote = await this.quote(mint, USDC_MINT, rawIn, signal);
    const usdcOut = num(quote?.outAmount);
    if (usdcOut === null || usdcOut <= 0) throw new RouteUnavailable();
    return usdcOut / 10 ** USDC_DECIMALS / ((Number(rawIn) / unit.scale) * unit.multiplier);
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
