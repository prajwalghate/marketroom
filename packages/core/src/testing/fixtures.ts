/**
 * Shared test fixtures. Not exported from the package — test-only.
 */

import type { DepthProbe, Fill } from '../fills';

/**
 * Routed fills measured live against Jupiter's quote API on 2026-10-05 at
 * ~22:58 UTC, US after-hours. Real numbers, so the assertions below describe
 * the market as it was rather than a model of it.
 */
export function routeProbe(
  listingId: string,
  displayedPrice: number,
  ladder: Record<number, [buy: number | null, sell: number | null]>,
): DepthProbe {
  const fills: Fill[] = [];
  for (const side of ['buy', 'sell'] as const) {
    for (const [size, [buy, sell]] of Object.entries(ladder)) {
      const price = side === 'buy' ? buy : sell;
      fills.push({
        side,
        notionalUsd: Number(size),
        price,
        method: 'route',
        failure: price === null ? 'no-liquidity' : null,
      });
    }
  }
  return {
    listingId,
    venue: 'solana',
    displayedPrice,
    fills,
    measuredAt: Date.UTC(2026, 9, 5, 22, 58),
    source: 'Jupiter swap quotes',
    lastTradeAt: null,
  };
}

export const MEASURED = {
  nvdax: routeProbe('solana:nvdax', 239.5285865168541, {
    100: [239.93, 239.92],
    1000: [239.95, 239.91],
    10000: [240.02, 239.9],
    100000: [240.43, 239.71],
  }),
  aaplx: routeProbe('solana:aaplx', 332.74715727392555, {
    100: [334.53, 333.8],
    1000: [334.81, 333.7],
    10000: [335.39, 333.54],
    100000: [337.66, 329.66],
  }),
  // $111 of pool liquidity behind a $2,000 display price.
  asmlx: routeProbe('solana:asmlx', 2000.653419093922, {
    100: [3391.5, 1785.05],
    1000: [6434.4, 1781.07],
    10000: [62336.86, 368.28],
    100000: [579413.45, 43.05],
  }),
  // Quoting $85.51 with no route at any size.
  crwvx: routeProbe('solana:crwvx', 85.509480449361, {
    100: [null, null],
    1000: [null, null],
    10000: [null, null],
    100000: [null, null],
  }),
};
