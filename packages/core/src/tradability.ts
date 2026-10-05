/**
 * Can this listing actually be traded, and at what size?
 *
 * The product shows a price for every listing it indexes. That is only
 * defensible if a price means something, and for a thin on-chain pool it does
 * not: a quote off a pool holding $107 is the last print from a market nobody
 * can use. Showing it beside a venue with real depth, and calling the gap a
 * spread, states something false.
 *
 * ## What this can and cannot conclude
 *
 * These checks are a **floor**, not a depth measurement. Pool liquidity bounds
 * tradability in one direction only:
 *
 *  - Low liquidity is conclusive. $10k cannot come out of a $107 pool under
 *    any curve or routing.
 *  - High liquidity concludes nothing. Measured against Jupiter's quote API,
 *    TSLAx held ~$1.45M and a constant-product model predicts ~1.4% impact on
 *    $10k — the observed figure at five times that size was 0.27%, because
 *    routing crosses concentrated-liquidity pools that are far more efficient
 *    near the current price.
 *
 * So the best state here is `unmeasured`, not `ok`. Claiming a listing is
 * liquid on the strength of a TVL number would be the same category of error
 * as claiming a price is fresh on the strength of our own poll clock.
 * Measuring real depth needs the impact curve (quote API at several sizes),
 * which is a separate fetch on a slower cache.
 *
 * Perps are deliberately left `unmeasured` for now. `impactPrices` gives a
 * genuine read on book depth, but picking a threshold for it without first
 * measuring a range of markets would repeat exactly the mistake the TVL note
 * above describes.
 */

import type { AssetView, Listing, ListingQuote } from './types';

/**
 * The size every depth claim is stated against.
 *
 * One number, used everywhere and shown to the reader, rather than an abstract
 * score. Large enough to be a real position, small enough that a healthy venue
 * absorbs it without comment.
 */
export const REFERENCE_NOTIONAL_USD = 10_000;

/**
 * Below this, a listing cannot support any meaningful trade.
 *
 * Set well under the smallest genuinely usable pool in the observed universe
 * so it cannot catch a working market: the sample that motivated it ran $0,
 * $0, $0 and $107 for dead listings, against $16k for the thinnest live one.
 */
export const DEAD_POOL_USD = 1_000;

/**
 * Below this, the reference trade is a large enough fraction of the pool that
 * no routing can rescue it — a $10k trade against a $100k pool moves the price
 * regardless of how the liquidity is shaped.
 */
export const LIMITED_POOL_RATIO = 10;

export type TradabilityState =
  /** Positive evidence this cannot absorb a meaningful trade. */
  | 'dead'
  /** The reference notional is a large fraction of known liquidity. */
  | 'limited'
  /** No floor concern. Real depth has not been measured — see the note above. */
  | 'unmeasured';

export interface Tradability {
  readonly state: TradabilityState;
  /** The size the assessment is stated against. */
  readonly referenceNotional: number;
  /** Known pool liquidity in USD, where the venue reports it. */
  readonly liquidity: number | null;
  /** Plain-language grounds, for display. Empty when `unmeasured`. */
  readonly reasons: readonly string[];
}

/** Whether a listing is sound enough to quote a price for without qualification. */
export function isQuotable(t: Tradability): boolean {
  return t.state === 'unmeasured';
}

/**
 * Whether this instrument is backed by an on-chain pool whose size the venue
 * is expected to report.
 *
 * This distinction decides what a *missing* liquidity figure means, and the
 * two readings are opposites:
 *
 *  - A perpetual settles against an oracle and has no pool at all, so absence
 *    carries no information. Reading it as zero would condemn every derivative
 *    in the index.
 *  - A pool-backed token is only tradable *because* a pool exists. Jupiter
 *    omits `liquidity` entirely for a token with no pool rather than returning
 *    zero — CRWVx came back with no `liquidity` and no `stats24h` while still
 *    quoting a price of $85.51. Treating that as "unknown" let a dead listing
 *    rank as the largest dislocation on the homepage.
 */
function isPoolBacked(kind: Listing['kind']): boolean {
  return kind !== 'perpetual';
}

export function tradabilityOf(entry: ListingQuote): Tradability {
  const { listing, quote } = entry;
  const liquidity = quote?.liquidity ?? null;
  const reasons: string[] = [];

  if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) {
    return {
      state: 'dead',
      referenceNotional: REFERENCE_NOTIONAL_USD,
      liquidity,
      reasons: ['No price is being reported for this listing.'],
    };
  }

  // Absence is itself the signal for a pool-backed instrument.
  if (liquidity === null && isPoolBacked(listing.kind)) {
    return {
      state: 'dead',
      referenceNotional: REFERENCE_NOTIONAL_USD,
      liquidity,
      reasons: [
        'No liquidity pool is reported for this token, so there is nothing to trade against.',
      ],
    };
  }

  // Only conclude from a figure when the venue actually reports one. A perp
  // has no pool, and `null` must never be read as zero there.
  if (liquidity !== null) {
    if (liquidity < DEAD_POOL_USD) {
      reasons.push(`Pool holds ${formatUsd(liquidity)} — too little to trade against at any size.`);
      return {
        state: 'dead',
        referenceNotional: REFERENCE_NOTIONAL_USD,
        liquidity,
        reasons,
      };
    }

    if (liquidity < REFERENCE_NOTIONAL_USD * LIMITED_POOL_RATIO) {
      reasons.push(
        `Pool holds ${formatUsd(liquidity)}, so a ${formatUsd(REFERENCE_NOTIONAL_USD)} trade is a ` +
          `large share of it and would move the price.`,
      );
      return {
        state: 'limited',
        referenceNotional: REFERENCE_NOTIONAL_USD,
        liquidity,
        reasons,
      };
    }
  }

  // Trade recency, where the venue reports it. This does not change the state
  // — a pool with depth and no recent trades is still tradable — but it is
  // worth saying, because a price nobody has tested is a weaker price.
  if (quote.tradeCount24h !== null && quote.tradeCount24h === 0) {
    reasons.push('No trades recorded in the last 24 hours.');
  }

  return {
    state: 'unmeasured',
    referenceNotional: REFERENCE_NOTIONAL_USD,
    liquidity,
    reasons,
  };
}

/**
 * The share of 24h volume the venue classifies as organic.
 *
 * Returns `null` rather than guessing when either figure is missing. The
 * classification belongs to the venue; anywhere this is displayed must say so,
 * because we cannot independently verify wash trading and a trust surface that
 * launders someone else's judgement into its own authority has the exact
 * failure it exists to prevent.
 */
export function organicShare(entry: ListingQuote): number | null {
  const q = entry.quote;
  if (!q || q.volume24h === null || q.organicVolume24h === null) return null;
  if (q.volume24h <= 0) return null;
  return q.organicVolume24h / q.volume24h;
}

/** Listings on this asset that cannot carry a price without qualification. */
export function untradableListings(view: AssetView): ListingQuote[] {
  return view.listings.filter((entry) => !isQuotable(tradabilityOf(entry)));
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}
