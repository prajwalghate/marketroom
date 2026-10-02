import { describe, expect, it } from 'vitest';
import { priceChange24h } from '@marketroom/core';
import { SolanaAdapter } from './adapter';

/**
 * Regression tests for the Jupiter unit conversion.
 *
 * `stats24h.priceChange` is a percentage, not a fraction. Reading it as a
 * fraction made NVDA render as +108% on the day instead of +1.19%, which is the
 * kind of bug that looks like real data and so survives a casual review.
 */

// The conversion is module-private, so we exercise it through the public
// adapter surface with a stubbed fetch.
function quoteWith(priceChange: number, usdPrice = 234.13) {
  const mint = 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh'; // NVDAx, in the catalog
  const original = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        { id: mint, usdPrice, liquidity: 1000, holderCount: 10, stats24h: { priceChange } },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )) as typeof fetch;

  return new SolanaAdapter().fetchQuotes().finally(() => {
    globalThis.fetch = original;
  });
}

describe('SolanaAdapter price change units', () => {
  it('reads priceChange as a percentage, not a fraction', async () => {
    const [quote] = await quoteWith(1.191839158714524);
    expect(quote).toBeDefined();

    // 234.13 / 1.0119 ≈ 231.38 — matches the same asset on Hyperliquid.
    expect(quote!.prevDayPrice).toBeCloseTo(231.38, 1);

    const change = priceChange24h(quote!);
    expect(change!.fraction).toBeCloseTo(0.0119, 3);
    // The bug produced ~1.08 here.
    expect(change!.fraction).toBeLessThan(0.1);
  });

  it('handles a negative change', async () => {
    const [quote] = await quoteWith(-2.5, 100);
    expect(quote!.prevDayPrice).toBeCloseTo(102.564, 2);
    expect(priceChange24h(quote!)!.direction).toBe('down');
  });

  it('returns null previous price when the change is absent', async () => {
    const [quote] = await quoteWith(Number.NaN);
    expect(quote!.prevDayPrice).toBeNull();
    expect(priceChange24h(quote!)).toBeNull();
  });
});
