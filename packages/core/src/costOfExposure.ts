/**
 * Cost of exposure — what it actually costs to hold an asset on each venue.
 *
 * This is the question a cross-venue index exists to answer. "NVDA trades 0.03%
 * apart across venues" is trivia; "holding $10k of NVDA for 30 days costs 1.84%
 * as a perp and 0.31% as a token, so the token wins beyond 6 days" is a
 * decision.
 *
 * The two instruments have opposite cost shapes, which is why there is a
 * crossover at all:
 *
 *   - A **perp** is cheap to enter (tight book) and charges rent forever
 *     (funding, every hour you hold it). Cost grows with time.
 *   - A **token** is expensive to enter (AMM slippage plus LP fees) and charges
 *     nothing to hold. Cost is flat in time.
 *
 * So short holds favour the perp and long holds favour the token, and the
 * break-even depends on the asset, the size and the funding rate right now.
 *
 * Pure and dependency-free: every input is supplied by the caller, so this is
 * unit-testable and cannot disagree between server and client.
 */

import type { InstrumentKind, VenueId } from './types';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** What it costs to get in and out of one venue, plus what it costs to stay. */
export interface VenueCostInputs {
  readonly listingId: string;
  readonly venue: VenueId;
  readonly kind: InstrumentKind;

  /**
   * Round-trip execution cost as a fraction of notional — in and back out.
   *
   * For a perp this is the book spread plus taker fees both ways. For a token
   * it is AMM price impact plus LP fees, which is why it must be measured at
   * the actual size rather than quoted from a mid price.
   *
   * `null` when the venue gives us nothing to measure it with; the result is
   * then marked incomplete rather than quietly treated as free.
   */
  readonly roundTripFraction: number | null;

  /**
   * Funding rate per hour, as a fraction, as the venue publishes it.
   *
   * Sign convention follows the venue: positive means longs pay shorts. We
   * model a long position, so positive funding is a cost and negative funding
   * is income. `null` for instruments with no carry — a spot token does not
   * charge rent.
   */
  readonly fundingRatePerHour: number | null;

  /** Maximum leverage. `1` for spot, which is what makes capital differ. */
  readonly maxLeverage: number;
}

export interface ExposureParams {
  /** Position size in USD — the exposure, not the capital posted. */
  readonly notionalUsd: number;
  readonly days: number;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface CostComponent {
  readonly label: string;
  readonly fraction: number;
  readonly usd: number;
  /** True when this component grows with holding period. */
  readonly recurring: boolean;
}

export interface VenueCost {
  readonly listingId: string;
  readonly venue: VenueId;
  readonly kind: InstrumentKind;
  readonly components: readonly CostComponent[];
  /** Total cost as a fraction of notional. Negative means net income. */
  readonly totalFraction: number;
  readonly totalUsd: number;
  /** Capital actually required, which differs from notional under leverage. */
  readonly capitalRequiredUsd: number;
  /**
   * False when an input was missing, so the figure understates the true cost.
   * The UI must say so rather than presenting a confident wrong number.
   */
  readonly complete: boolean;
}

const HOURS_PER_DAY = 24;

/**
 * Cost of holding one listing for a period.
 *
 * Deliberately linear in time: funding compounds in reality, but the rate is
 * itself a live number that will change long before compounding matters at
 * these magnitudes. Presenting a compounded figure would imply a precision the
 * input does not have.
 */
export function venueCost(inputs: VenueCostInputs, params: ExposureParams): VenueCost {
  const { notionalUsd, days } = params;
  const components: CostComponent[] = [];
  let complete = true;

  if (inputs.roundTripFraction === null) {
    complete = false;
  } else {
    components.push({
      label: inputs.kind === 'perpetual' ? 'Spread + fees (round trip)' : 'Swap cost (round trip)',
      fraction: inputs.roundTripFraction,
      usd: inputs.roundTripFraction * notionalUsd,
      recurring: false,
    });
  }

  if (inputs.fundingRatePerHour !== null) {
    const fraction = inputs.fundingRatePerHour * HOURS_PER_DAY * days;
    components.push({
      label: fraction >= 0 ? 'Funding paid' : 'Funding received',
      fraction,
      usd: fraction * notionalUsd,
      recurring: true,
    });
  }

  const totalFraction = components.reduce((sum, c) => sum + c.fraction, 0);

  return {
    listingId: inputs.listingId,
    venue: inputs.venue,
    kind: inputs.kind,
    components,
    totalFraction,
    totalUsd: totalFraction * notionalUsd,
    capitalRequiredUsd: notionalUsd / Math.max(1, inputs.maxLeverage),
    complete,
  };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export interface ExposureComparison {
  readonly costs: readonly VenueCost[];
  /** Lowest total cost. `null` if nothing could be computed. */
  readonly cheapest: VenueCost | null;
  /**
   * Holding period in days at which the ranking flips, if it does within the
   * horizon searched. This is the headline number — the reason to show this at
   * all rather than a single percentage.
   */
  readonly crossoverDays: number | null;
  /** The venue that is cheaper *before* the crossover. */
  readonly cheaperBefore: VenueCost | null;
  /** The venue that is cheaper *after* it. */
  readonly cheaperAfter: VenueCost | null;
}

/** Maximum holding period searched for a crossover. */
const MAX_HORIZON_DAYS = 365;

/**
 * Compare venues at a given size and holding period, and find where the answer
 * changes.
 *
 * The crossover is solved directly rather than scanned: each venue's cost is
 * `fixed + perDay × days`, so two venues cross where their lines meet. Only
 * pairs with different slopes can cross at all — two spot tokens never will.
 */
export function compareExposure(
  inputs: readonly VenueCostInputs[],
  params: ExposureParams,
): ExposureComparison {
  const costs = inputs.map((input) => venueCost(input, params));
  const usable = costs.filter((c) => c.complete);

  const cheapest =
    usable.length > 0
      ? usable.reduce((best, c) => (c.totalFraction < best.totalFraction ? c : best))
      : null;

  // Only a two-venue comparison has an unambiguous crossover. With three or
  // more the "cheapest" can change hands repeatedly, and a single number would
  // misrepresent it.
  if (usable.length !== 2) {
    return { costs, cheapest, crossoverDays: null, cheaperBefore: null, cheaperAfter: null };
  }

  const [a, b] = usable as [VenueCost, VenueCost];
  const lineOf = (c: VenueCost, source: VenueCostInputs | undefined) => ({
    fixed: c.components.filter((x) => !x.recurring).reduce((s, x) => s + x.fraction, 0),
    perDay: (source?.fundingRatePerHour ?? 0) * HOURS_PER_DAY,
  });

  const lineA = lineOf(
    a,
    inputs.find((i) => i.listingId === a.listingId),
  );
  const lineB = lineOf(
    b,
    inputs.find((i) => i.listingId === b.listingId),
  );

  const slopeDelta = lineA.perDay - lineB.perDay;
  if (slopeDelta === 0) {
    return { costs, cheapest, crossoverDays: null, cheaperBefore: null, cheaperAfter: null };
  }

  const crossover = (lineB.fixed - lineA.fixed) / slopeDelta;
  if (!Number.isFinite(crossover) || crossover <= 0 || crossover > MAX_HORIZON_DAYS) {
    return { costs, cheapest, crossoverDays: null, cheaperBefore: null, cheaperAfter: null };
  }

  // Evaluate either side of the crossover to say which way round it goes,
  // rather than inferring it from the sign of the slope difference.
  const costAt = (line: { fixed: number; perDay: number }, d: number) =>
    line.fixed + line.perDay * d;
  const before = crossover / 2;
  const after = crossover * 1.5;

  return {
    costs,
    cheapest,
    crossoverDays: crossover,
    cheaperBefore: costAt(lineA, before) < costAt(lineB, before) ? a : b,
    cheaperAfter: costAt(lineA, after) < costAt(lineB, after) ? a : b,
  };
}
