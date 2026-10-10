/**
 * What a real order would fill at.
 *
 * Every price this product shows is somebody's *last* number — the last
 * trade, the last pool state, the venue's mid. None of them says what an order
 * of a given size would actually get, and on a thin listing the difference is
 * not a rounding error. Measured on 2026-10-05: ASMLx on Solana displayed
 * $2,000.65 while a $1,000 buy routed through Jupiter filled at $6,434 a
 * share. A screen that shows the first number and not the second is reporting
 * a price nobody can trade at.
 *
 * This module is the measurement model. A listing is probed at a fixed ladder
 * of sizes on both sides, and every derived figure — the executable mid,
 * slippage, depth, round-trip cost — is computed from those fills. Never from
 * pool TVL or volume, which bound tradability in one direction only (see
 * `tradability.ts`).
 *
 * Pure: the fills arrive from the adapters; nothing here performs I/O.
 */

import type { BookLevel, VenueId } from './types';

export type Side = 'buy' | 'sell';

/**
 * The ladder every listing is probed at, in USD.
 *
 * Log-spaced, so a fill curve reads evenly from a retail ticket to an
 * institutional clip. $10k is the size every verdict is stated against.
 */
export const PROBE_SIZES_USD = [100, 1_000, 10_000, 100_000] as const;

/**
 * How a fill was obtained. Shown on the receipt, because the methods differ in
 * what they are entitled to claim.
 */
export type FillMethod =
  /** The venue's full-precision order book, walked level by level. Exact for the visible book. */
  | 'book'
  /**
   * A price-aggregated book, used only when the full-precision one runs out.
   * Each bucket is priced at its far edge, so this overstates the cost by up
   * to one bucket width — a deliberate bias toward caution.
   */
  | 'book-aggregated'
  /** An aggregator's routed quote: what a swap of this size would execute at now, pool fees included. */
  | 'route';

export type FillFailure =
  /** No route and no resting orders at all. */
  | 'no-liquidity'
  /** Liquidity exists, but not enough to fill this size. */
  | 'insufficient-depth'
  /** The measurement itself failed. Says nothing about the market. */
  | 'error';

export interface Fill {
  readonly side: Side;
  readonly notionalUsd: number;
  /** Average execution price, USD per unit. `null` when the order could not be filled. */
  readonly price: number | null;
  readonly method: FillMethod;
  readonly failure: FillFailure | null;
}

/** One listing, measured once. */
export interface DepthProbe {
  readonly listingId: string;
  readonly venue: VenueId;
  /** The price the venue displays, captured in the same pass as the fills. */
  readonly displayedPrice: number | null;
  readonly fills: readonly Fill[];
  /** Epoch ms. Our clock — this is our measurement, not a claim about the venue. */
  readonly measuredAt: number;
  /** What was queried, in words, for the receipt. */
  readonly source: string;
  /** Epoch ms of the venue's most recent trade, where it was measured. */
  readonly lastTradeAt: number | null;
}

/** Probes keyed by listing id. A plain record, so it survives JSON caching. */
export type ProbeIndex = Readonly<Record<string, DepthProbe>>;

// ---------------------------------------------------------------------------
// Book walking
// ---------------------------------------------------------------------------

/** Below this many dollars left unfilled, an order counts as filled — float dust, not depth. */
const FILL_EPSILON_USD = 1e-6;

/**
 * Walk one side of a book with a USD-sized order.
 *
 * Buys spend `notionalUsd` against the asks. Sells deliver
 * `notionalUsd / referencePrice` units into the bids — the position a buyer of
 * that notional would hold — so both sides of the ladder describe the same
 * trade. Aggregator quotes are sized the same way, which is what makes a book
 * and a route comparable at all.
 *
 * Returns `null` when the visible book cannot absorb the whole order. A
 * partial fill priced as though it were complete would understate the cost of
 * exactly the orders this exists to warn about.
 */
export function walkBook(
  levels: readonly Pick<BookLevel, 'price' | 'size'>[],
  side: Side,
  notionalUsd: number,
  referencePrice: number,
): number | null {
  if (!(notionalUsd > 0) || !(referencePrice > 0)) return null;

  // Best-first, whatever order the venue sent. Asks ascend, bids descend.
  const ordered = [...levels]
    .filter((level) => level.price > 0 && level.size > 0)
    .sort((a, b) => (side === 'buy' ? a.price - b.price : b.price - a.price));

  if (side === 'buy') {
    let remainingUsd = notionalUsd;
    let units = 0;
    for (const level of ordered) {
      const takeUsd = Math.min(remainingUsd, level.price * level.size);
      units += takeUsd / level.price;
      remainingUsd -= takeUsd;
      if (remainingUsd <= FILL_EPSILON_USD) break;
    }
    return remainingUsd > FILL_EPSILON_USD || units <= 0 ? null : notionalUsd / units;
  }

  const totalUnits = notionalUsd / referencePrice;
  let remainingUnits = totalUnits;
  let proceeds = 0;
  for (const level of ordered) {
    const take = Math.min(remainingUnits, level.size);
    proceeds += take * level.price;
    remainingUnits -= take;
    if (remainingUnits * referencePrice <= FILL_EPSILON_USD) break;
  }
  return remainingUnits * referencePrice > FILL_EPSILON_USD ? null : proceeds / totalUnits;
}

/**
 * Fills for every probe size, both sides, from one book.
 *
 * A side with no levels at all is `no-liquidity`; a side that runs out partway
 * is `insufficient-depth`. The distinction is the difference between "nobody
 * is here" and "not enough people are here", and the receipt says which.
 */
export function fillsFromBook(
  book: { readonly bids: readonly BookLevel[]; readonly asks: readonly BookLevel[] },
  referencePrice: number,
  method: Extract<FillMethod, 'book' | 'book-aggregated'>,
  sizes: readonly number[] = PROBE_SIZES_USD,
): Fill[] {
  const fills: Fill[] = [];
  for (const side of ['buy', 'sell'] as const) {
    const levels = side === 'buy' ? book.asks : book.bids;
    for (const notionalUsd of sizes) {
      const price = walkBook(levels, side, notionalUsd, referencePrice);
      fills.push({
        side,
        notionalUsd,
        price,
        method,
        failure:
          price !== null ? null : levels.length === 0 ? 'no-liquidity' : 'insufficient-depth',
      });
    }
  }
  return fills;
}

// ---------------------------------------------------------------------------
// Reading a probe
// ---------------------------------------------------------------------------

export function fillAt(probe: DepthProbe, side: Side, notionalUsd: number): Fill | null {
  return probe.fills.find((f) => f.side === side && f.notionalUsd === notionalUsd) ?? null;
}

const priceAt = (probe: DepthProbe, side: Side, notionalUsd: number): number | null =>
  fillAt(probe, side, notionalUsd)?.price ?? null;

/** Probe sizes present in this probe, ascending. */
export function probeSizes(probe: DepthProbe): number[] {
  return [...new Set(probe.fills.map((f) => f.notionalUsd))].sort((a, b) => a - b);
}

export interface ExecutableMid {
  /** Midpoint of the smallest buy and sell that both filled. */
  readonly mid: number;
  /** Gap between those two fills, as a fraction of the mid. */
  readonly spread: number;
  /** The size the mid was taken at. */
  readonly notionalUsd: number;
}

/**
 * Where the market actually is: the midpoint of the smallest round trip.
 *
 * Deliberately not the displayed price. A displayed price can lag the pool it
 * describes, and a verdict built on it would condemn a deep market for a stale
 * label, or bless a dead one for a fresh label. The label gets its own check.
 */
export function executableMid(probe: DepthProbe): ExecutableMid | null {
  for (const size of probeSizes(probe)) {
    const buy = priceAt(probe, 'buy', size);
    const sell = priceAt(probe, 'sell', size);
    if (buy === null || sell === null) continue;
    const mid = (buy + sell) / 2;
    if (!(mid > 0)) continue;
    return { mid, spread: (buy - sell) / mid, notionalUsd: size };
  }
  return null;
}

/**
 * How far the worse side of a trade lands from `anchor`, as a fraction.
 *
 * `null` when either side cannot fill at this size — "could not be done" is
 * not a large number, and must not be averaged or sorted as one.
 */
export function slippageAt(probe: DepthProbe, notionalUsd: number, anchor: number): number | null {
  if (!(anchor > 0)) return null;
  const buy = priceAt(probe, 'buy', notionalUsd);
  const sell = priceAt(probe, 'sell', notionalUsd);
  if (buy === null || sell === null) return null;
  return Math.max(buy / anchor - 1, 1 - sell / anchor, 0);
}

/**
 * What a buy-then-sell at this size gives up, as a fraction of the buy.
 *
 * Both legs are the same notional rather than the same quantity, which differs
 * from a chained round trip by the slippage squared — well under what the
 * receipts display.
 */
export function roundTripAt(probe: DepthProbe, notionalUsd: number): number | null {
  const buy = priceAt(probe, 'buy', notionalUsd);
  const sell = priceAt(probe, 'sell', notionalUsd);
  if (buy === null || sell === null || !(buy > 0)) return null;
  return 1 - sell / buy;
}

/**
 * How far from the *displayed* price a trade of this size actually lands —
 * worse side first.
 *
 * This is the number a reader of any other screen is exposed to: they see the
 * displayed price, and this is how wrong it is for an order of this size.
 * Returns which side is worse, so a sentence can say "a $1,000 buy fills at"
 * rather than an abstract percentage.
 */
export function displayGapAt(
  probe: DepthProbe,
  notionalUsd: number,
): { side: Side; fraction: number; price: number } | null {
  const shown = probe.displayedPrice;
  if (shown === null || !(shown > 0)) return null;
  const buy = priceAt(probe, 'buy', notionalUsd);
  const sell = priceAt(probe, 'sell', notionalUsd);
  if (buy === null && sell === null) return null;

  const buyGap = buy === null ? -Infinity : buy / shown - 1;
  const sellGap = sell === null ? -Infinity : 1 - sell / shown;
  return buyGap >= sellGap
    ? { side: 'buy', fraction: buyGap, price: buy! }
    : { side: 'sell', fraction: sellGap, price: sell! };
}

// ---------------------------------------------------------------------------
// Depth
// ---------------------------------------------------------------------------

/**
 * The largest trade that stays within a tolerance — or the bound we can state.
 *
 * `about` is interpolated between two measured sizes on a log scale, and is
 * labelled as an estimate wherever it is shown. The other two are measured
 * facts: every probe passed, or none did.
 */
export type SizeBound =
  | { readonly kind: 'at-least'; readonly usd: number }
  | { readonly kind: 'about'; readonly usd: number }
  | { readonly kind: 'below'; readonly usd: number };

export function sizeWithin(probe: DepthProbe, anchor: number, tolerance: number): SizeBound | null {
  const sizes = probeSizes(probe);
  if (sizes.length === 0 || !(anchor > 0)) return null;

  let previous: { size: number; slip: number } | null = null;
  for (const size of sizes) {
    const slip = slippageAt(probe, size, anchor);
    const within = slip !== null && slip <= tolerance;
    if (within) {
      previous = { size, slip };
      continue;
    }
    if (!previous) return { kind: 'below', usd: size };
    // Could not fill at the next size: all we know is the last size that held.
    if (slip === null) return { kind: 'at-least', usd: previous.size };

    const t = (tolerance - previous.slip) / (slip - previous.slip);
    const log = Math.log10(previous.size) + t * (Math.log10(size) - Math.log10(previous.size));
    return { kind: 'about', usd: roundToSignificant(10 ** log, 2) };
  }
  return { kind: 'at-least', usd: sizes[sizes.length - 1]! };
}

function roundToSignificant(value: number, digits: number): number {
  if (!(value > 0)) return 0;
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - digits + 1);
  return Math.round(value / magnitude) * magnitude;
}
