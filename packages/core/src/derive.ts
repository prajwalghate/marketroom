/**
 * Pure derivations over domain entities.
 *
 * Everything here is a total function with no I/O. These are the calculations
 * most likely to be subtly wrong (and most worth unit-testing), so they live in
 * one place rather than being scattered through components.
 */

import { isQuotable, tradabilityOf } from './tradability';
import type { AssetView, Candle, ListingQuote, OrderBook, Quote } from './types';

// ---------------------------------------------------------------------------
// Price change
// ---------------------------------------------------------------------------

export type Direction = 'up' | 'down' | 'flat';

export interface PriceChange {
  readonly absolute: number;
  /** Fraction, not percent. `0.0213` means +2.13%. */
  readonly fraction: number;
  readonly direction: Direction;
}

/**
 * 24h change for a quote. Returns `null` when the venue gives no reference
 * price — we show "—", never a fabricated 0%.
 */
export function priceChange24h(quote: Quote): PriceChange | null {
  const { price, prevDayPrice } = quote;
  if (prevDayPrice === null || !Number.isFinite(prevDayPrice) || prevDayPrice === 0) {
    return null;
  }
  const absolute = price - prevDayPrice;
  return {
    absolute,
    fraction: absolute / prevDayPrice,
    direction: directionOf(absolute),
  };
}

/**
 * Direction with a dead zone. Floating-point noise around zero would otherwise
 * flicker a price between up and down on every tick.
 */
export function directionOf(delta: number, epsilon = 1e-9): Direction {
  if (!Number.isFinite(delta) || Math.abs(delta) <= epsilon) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

// ---------------------------------------------------------------------------
// Cross-venue aggregation — only possible because of the Asset/Listing split
// ---------------------------------------------------------------------------

/** Sum of a metric across every venue carrying this asset. */
function sumAcross(view: AssetView, pick: (q: Quote) => number | null): number | null {
  let total = 0;
  let found = false;
  for (const { quote } of view.listings) {
    if (!quote) continue;
    const value = pick(quote);
    if (value === null || !Number.isFinite(value)) continue;
    total += value;
    found = true;
  }
  return found ? total : null;
}

export const aggregateVolume24h = (view: AssetView): number | null =>
  sumAcross(view, (q) => q.volume24h);

export const aggregateOpenInterest = (view: AssetView): number | null =>
  sumAcross(view, (q) => q.openInterest);

export const aggregateLiquidity = (view: AssetView): number | null =>
  sumAcross(view, (q) => q.liquidity);

/**
 * The listing that should represent this asset in a list view: the one with
 * the most 24h volume, since that is the most faithful price. Falls back to any
 * quoted listing, then to any listing at all, so an asset is never dropped from
 * the index just because every venue is quiet.
 */
export function primaryListing(view: AssetView): ListingQuote | null {
  if (view.listings.length === 0) return null;

  let best: ListingQuote | null = null;
  let bestVolume = -Infinity;

  for (const candidate of view.listings) {
    if (!candidate.quote) continue;
    const volume = candidate.quote.volume24h ?? 0;
    if (volume > bestVolume) {
      bestVolume = volume;
      best = candidate;
    }
  }

  return best ?? view.listings[0] ?? null;
}

/** Volume-weighted price across venues — more robust than any single venue. */
export function consolidatedPrice(view: AssetView): number | null {
  let weighted = 0;
  let weight = 0;
  let fallback: number | null = null;

  for (const { quote } of view.listings) {
    if (!quote || !Number.isFinite(quote.price)) continue;
    fallback ??= quote.price;
    const volume = quote.volume24h;
    if (volume !== null && Number.isFinite(volume) && volume > 0) {
      weighted += quote.price * volume;
      weight += volume;
    }
  }

  if (weight > 0) return weighted / weight;
  // Every venue is quoted but none has volume — fall back to a raw price
  // rather than reporting nothing.
  return fallback;
}

export interface VenueSpread {
  readonly low: ListingQuote;
  readonly high: ListingQuote;
  readonly absolute: number;
  /** Fraction of the lower price. */
  readonly fraction: number;

  /**
   * Whether this gap can honestly be called a spread.
   *
   * A spread implies two prices you could trade between. When one leg cannot
   * absorb a meaningful order, the difference is a stale print sitting next to
   * a live market, and presenting it as a dislocation invites a trade that
   * does not exist. ASML was the case that forced this: a 5.74% gap, published
   * as a headline, with $107 of liquidity behind the expensive side.
   *
   * The gap is still returned when this is `false` — suppressing it outright
   * would hide a real fact about the listing. It is the *framing* that has to
   * change, so callers must branch on this rather than on the number.
   */
  readonly comparable: boolean;

  /** Why it is not comparable. Empty when it is. */
  readonly reasons: readonly string[];
}

/**
 * Above this, two listings are almost certainly not the same instrument.
 *
 * Genuine cross-venue dislocation on a liquid equity is measured in basis
 * points, not multiples. A gap this large means a bad catalog mapping — e.g.
 * pointing an index asset at an ETF-backed token priced at 1/10 the index
 * level, which is exactly the bug this guard was added for.
 *
 * Suppressing it is the safe failure mode: presenting a mapping error as a
 * 900% arbitrage opportunity would be actively dangerous on a product whose
 * entire premise is telling users what they are actually holding.
 */
const IMPLAUSIBLE_SPREAD = 0.5;

/**
 * Price dislocation between venues for the same underlying.
 *
 * This is the aggregator's signature metric and is only meaningful because one
 * asset holds many listings. Returns `null` unless at least two venues are
 * quoting.
 */
export function venueSpread(view: AssetView): VenueSpread | null {
  const quoted = view.listings.filter(
    (l): l is ListingQuote & { quote: Quote } =>
      l.quote !== null && Number.isFinite(l.quote.price) && l.quote.price > 0,
  );
  if (quoted.length < 2) return null;

  let low = quoted[0]!;
  let high = quoted[0]!;
  for (const candidate of quoted) {
    if (candidate.quote.price < low.quote.price) low = candidate;
    if (candidate.quote.price > high.quote.price) high = candidate;
  }

  const absolute = high.quote.price - low.quote.price;
  const fraction = absolute / low.quote.price;

  // A gap this wide is a data-mapping error, not a tradable dislocation.
  if (fraction > IMPLAUSIBLE_SPREAD) return null;

  // The blunt cutoff above catches garbage. It does not catch the subtler and
  // more common case: a perfectly plausible-looking gap where one side has no
  // liquidity behind it. That needs the per-leg assessment.
  const reasons: string[] = [];
  for (const leg of [low, high]) {
    const assessment = tradabilityOf(leg);
    if (isQuotable(assessment)) continue;
    const venue = leg.listing.venue;
    for (const reason of assessment.reasons) {
      reasons.push(`${venue}: ${reason}`);
    }
    // A leg with no stated reason still fails the gate; say something rather
    // than silently marking it incomparable with an empty explanation.
    if (assessment.reasons.length === 0) {
      reasons.push(`${venue}: not enough liquidity to support a trade at this price.`);
    }
  }

  return { low, high, absolute, fraction, comparable: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// Order book
// ---------------------------------------------------------------------------

export interface Spread {
  readonly bid: number;
  readonly ask: number;
  readonly mid: number;
  readonly absolute: number;
  /** Fraction of mid. Multiply by 10_000 for basis points. */
  readonly fraction: number;
}

export function bookSpread(book: OrderBook): Spread | null {
  const bid = book.bids[0]?.price;
  const ask = book.asks[0]?.price;
  if (bid === undefined || ask === undefined) return null;

  const mid = (bid + ask) / 2;
  if (mid <= 0) return null;

  const absolute = ask - bid;
  return { bid, ask, mid, absolute, fraction: absolute / mid };
}

/**
 * Cumulative depth for a depth-chart, as running size totals outward from the
 * top of book.
 */
export function cumulativeDepth(
  levels: readonly { price: number; size: number }[],
): { price: number; total: number }[] {
  let running = 0;
  return levels.map((level) => {
    running += level.size;
    return { price: level.price, total: running };
  });
}

// ---------------------------------------------------------------------------
// Candles
// ---------------------------------------------------------------------------

/** Normalized 0..1 series for sparklines. Flat series map to a mid-line. */
export function normalizeCloses(candles: readonly Candle[]): number[] {
  if (candles.length === 0) return [];
  const closes = candles.map((c) => c.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min;
  if (range === 0) return closes.map(() => 0.5);
  return closes.map((close) => (close - min) / range);
}

/** Change across a candle series — drives sparkline colour. */
export function seriesChange(candles: readonly Candle[]): PriceChange | null {
  const first = candles[0];
  const last = candles[candles.length - 1];
  if (!first || !last || first.open === 0) return null;

  const absolute = last.close - first.open;
  return { absolute, fraction: absolute / first.open, direction: directionOf(absolute) };
}
