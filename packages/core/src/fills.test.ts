import { describe, expect, it } from 'vitest';
import {
  displayGapAt,
  executableMid,
  fillsFromBook,
  roundTripAt,
  sizeWithin,
  slippageAt,
  walkBook,
} from './fills';
import { formatPercentAdaptive } from './format';
import { MEASURED, routeProbe } from './testing/fixtures';

describe('walkBook', () => {
  it('fills inside the first level at that level’s price', () => {
    expect(walkBook([{ price: 100, size: 10 }], 'buy', 500, 100)).toBe(100);
  });

  it('averages across levels by units, not by level count', () => {
    // $100 buys 1 unit at 100; the next $101 buys 1 unit at 101 → 2 units for $201.
    const asks = [
      { price: 100, size: 1 },
      { price: 101, size: 10 },
    ];
    expect(walkBook(asks, 'buy', 201, 100)).toBeCloseTo(100.5, 10);
  });

  it('sells the quantity a buyer of the same notional would hold', () => {
    // $198 at a $99 reference is 2 units: one at 99, one at 98.
    const bids = [
      { price: 99, size: 1 },
      { price: 98, size: 10 },
    ];
    expect(walkBook(bids, 'sell', 198, 99)).toBeCloseTo(98.5, 10);
  });

  it('reads levels best-first whatever order they arrive in', () => {
    const asks = [
      { price: 101, size: 10 },
      { price: 100, size: 1 },
    ];
    expect(walkBook(asks, 'buy', 201, 100)).toBeCloseTo(100.5, 10);
  });

  it('refuses to price an order the book cannot absorb', () => {
    // A partial fill priced as complete would understate the cost of exactly
    // the orders this exists to warn about.
    expect(walkBook([{ price: 100, size: 1 }], 'buy', 1_000, 100)).toBeNull();
  });

  it('ignores empty and non-positive levels', () => {
    expect(
      walkBook(
        [
          { price: 0, size: 5 },
          { price: 100, size: 0 },
          { price: 100, size: 10 },
        ],
        'buy',
        100,
        100,
      ),
    ).toBe(100);
  });
});

describe('fillsFromBook', () => {
  it('distinguishes an empty side from a shallow one', () => {
    const fills = fillsFromBook(
      { bids: [], asks: [{ price: 100, size: 2, count: 1 }] },
      100,
      'book',
      [100, 1_000],
    );
    const find = (side: string, size: number) =>
      fills.find((f) => f.side === side && f.notionalUsd === size)!;
    expect(find('buy', 100).price).toBe(100);
    expect(find('buy', 1_000).failure).toBe('insufficient-depth');
    expect(find('sell', 100).failure).toBe('no-liquidity');
  });
});

describe('reading measured probes', () => {
  it('takes the executable mid from the smallest round trip, not the display', () => {
    const mid = executableMid(MEASURED.nvdax)!;
    expect(mid.mid).toBeCloseTo(239.925, 6);
    expect(mid.notionalUsd).toBe(100);
    expect(mid.spread).toBeLessThan(0.0001);
  });

  it('measures NVDAx at $10k within 0.04% of its mid', () => {
    const { mid } = executableMid(MEASURED.nvdax)!;
    expect(slippageAt(MEASURED.nvdax, 10_000, mid)).toBeCloseTo(0.000396, 5);
  });

  it('finds ASMLx has no stable price: $100 buys and sells land 62% apart', () => {
    expect(executableMid(MEASURED.asmlx)!.spread).toBeCloseTo(0.6207, 3);
  });

  it('reports how wrong the display is for a $1k ticket, worse side first', () => {
    const gap = displayGapAt(MEASURED.asmlx, 1_000)!;
    expect(gap.side).toBe('buy');
    expect(gap.price).toBe(6434.4);
    expect(formatPercentAdaptive(gap.fraction)).toBe('222%');
  });

  it('cannot read a mid, slippage or gap from a listing with no route', () => {
    expect(executableMid(MEASURED.crwvx)).toBeNull();
    expect(slippageAt(MEASURED.crwvx, 1_000, 85.5)).toBeNull();
    expect(displayGapAt(MEASURED.crwvx, 1_000)).toBeNull();
    expect(roundTripAt(MEASURED.crwvx, 10_000)).toBeNull();
  });

  it('never prints a measured cost as free', () => {
    expect(formatPercentAdaptive(0.00001)).toBe('<0.01%');
    expect(formatPercentAdaptive(0.00001, { signed: true })).toBe('+<0.01%');
    expect(formatPercentAdaptive(0)).toBe('0.00%');
  });

  it('prices a $10k round trip on NVDAx at five basis points', () => {
    expect(roundTripAt(MEASURED.nvdax, 10_000)).toBeCloseTo(1 - 239.9 / 240.02, 10);
  });
});

describe('sizeWithin', () => {
  it('states a floor when every probe passes', () => {
    const { mid } = executableMid(MEASURED.nvdax)!;
    expect(sizeWithin(MEASURED.nvdax, mid, 0.01)).toEqual({ kind: 'at-least', usd: 100_000 });
  });

  it('interpolates on a log scale between the last pass and the first fail', () => {
    // AAPLx: 0.37% at $10k, 1.35% at $100k → crosses 1% near $44k.
    const { mid } = executableMid(MEASURED.aaplx)!;
    expect(sizeWithin(MEASURED.aaplx, mid, 0.01)).toEqual({ kind: 'about', usd: 44_000 });
  });

  it('states a ceiling when even the smallest probe fails', () => {
    const { mid } = executableMid(MEASURED.asmlx)!;
    expect(sizeWithin(MEASURED.asmlx, mid, 0.01)).toEqual({ kind: 'below', usd: 100 });
  });

  it('only claims the last size that held when the next could not fill at all', () => {
    const probe = routeProbe('x', 100, {
      100: [100.1, 99.9],
      1000: [100.2, 99.8],
      10000: [null, null],
    });
    expect(sizeWithin(probe, 100, 0.01)).toEqual({ kind: 'at-least', usd: 1_000 });
  });
});
