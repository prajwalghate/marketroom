import { describe, expect, it } from 'vitest';
import type { Listing } from '@marketroom/core';
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

/**
 * Regression test for the Token-2022 scaled-UI conversion.
 *
 * NFLXx carries an on-chain multiplier of 10 after Netflix's 10-for-1 split.
 * Swap quotes count raw units; displayed prices count scaled ones. Without the
 * conversion, a $1,000 buy measured live at $71.02 a share was reported as
 * $710.17 — a 928% "gap" that existed only in our arithmetic.
 */
describe('SolanaAdapter probe units', () => {
  const listingFor = (mint: string) =>
    ({ id: mint, venue: 'solana', venueSymbol: mint }) as unknown as Listing;

  function probeWith(mint: string, mintAccount: unknown) {
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      if (String(url).includes('/tokens/v2/search')) {
        return json([{ id: mint, usdPrice: 69.07, decimals: 8 }]);
      }
      if (init?.method === 'POST') return json({ result: { value: [mintAccount] } });
      // Buys: $1,000 of USDC returns 1.40811 raw tokens — 14.08 displayed
      // NFLXx at a ×10 multiplier, i.e. $71.02 a share.
      if (String(url).includes('inputMint=EPjF')) {
        return json({ outAmount: String(Math.round((1000 / 710.17) * 1e8)) });
      }
      // Sells: whatever goes in comes back at $71.00 per displayed token.
      const rawIn = Number(new URL(String(url)).searchParams.get('amount'));
      return json({ outAmount: String(Math.round((rawIn / 1e8) * 10 * 71 * 1e6)) });
    }) as typeof fetch;
    return new SolanaAdapter().probeDepths([listingFor(mint)], [1_000]).finally(() => {
      globalThis.fetch = original;
    });
  }

  const scaled = (multiplier: string) => ({
    data: {
      parsed: {
        info: {
          extensions: [
            {
              extension: 'scaledUiAmountConfig',
              state: {
                multiplier: '1',
                newMultiplier: multiplier,
                newMultiplierEffectiveTimestamp: 1,
              },
            },
          ],
        },
      },
    },
  });

  it('prices fills per displayed token, applying the mint multiplier', async () => {
    const [probe] = await probeWith('nflx-a', scaled('10'));
    expect(probe!.fills.find((f) => f.side === 'buy')!.price).toBeCloseTo(71.017, 2);
    expect(probe!.fills.find((f) => f.side === 'sell')!.price).toBeCloseTo(71, 2);
  });

  it('reports a mint whose multiplier was never read as unmeasured, never as ×1', async () => {
    const [probe] = await probeWith('never-read', null);
    expect(probe!.fills.every((f) => f.price === null && f.failure === 'error')).toBe(true);
  });

  it('keeps the last multiplier read through a momentary RPC failure', async () => {
    await probeWith('nflx-b', scaled('10'));
    const [probe] = await probeWith('nflx-b', null);
    expect(probe!.fills.find((f) => f.side === 'buy')!.price).toBeCloseTo(71.017, 2);
  });
});

describe('SolanaAdapter rate limiting', () => {
  it('stops quoting for the rest of the pass after a 429, and reports the rest unmeasured', async () => {
    const mints = ['rl-a', 'rl-b', 'rl-c'];
    let quotes = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const json = (body: unknown, status = 200) =>
        new Response(typeof body === 'string' ? body : JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      if (String(url).includes('/tokens/v2/search')) {
        return json(mints.map((id) => ({ id, usdPrice: 100, decimals: 8 })));
      }
      if (init?.method === 'POST') {
        return json({ result: { value: mints.map(() => ({ data: { parsed: { info: {} } } })) } });
      }
      quotes++;
      return json('Rate limit exceeded, please try again later.', 429);
    }) as typeof fetch;
    try {
      const probes = await new SolanaAdapter().probeDepths(
        mints.map((m) => ({ id: m, venue: 'solana', venueSymbol: m }) as unknown as Listing),
        [1_000, 10_000],
        { concurrency: 1 },
      );
      expect(probes.flatMap((p) => p.fills).every((f) => f.failure === 'error')).toBe(true);
      // One listing's two sides hit the limit (each retried once by the HTTP
      // layer); the other two listings are never requested.
      expect(quotes).toBeLessThanOrEqual(4);
    } finally {
      globalThis.fetch = original;
    }
  });
});
