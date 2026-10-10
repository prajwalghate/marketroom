import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { DefiLlamaSolana } from './defillama';

const hacks = readFileSync(new URL('./__fixtures__/hacks.json', import.meta.url), 'utf8');

describe('DefiLlama hacks', () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
  });

  it('keeps Solana incidents only, newest first, with unknowns as null', async () => {
    let requested = '';
    globalThis.fetch = (async (url: string) => {
      requested = url;
      return new Response(hacks, { status: 200 });
    }) as typeof fetch;
    const rows = await new DefiLlamaSolana().hacks();
    expect(requested).toBe('https://api.llama.fi/hacks');
    // ApeCoin (Ethereum) and CoinsPaid (no chain) are dropped.
    expect(rows.map((r) => r.name)).toEqual([
      'Drift Trade',
      'DoodiPals',
      'pump.fun',
      'Ratio Finance',
      'Drift Trade',
    ]);
    expect(rows[0]).toEqual({
      name: 'Drift Trade',
      date: 1775001600_000,
      amount: 295_000_000,
      classification: 'Access Control',
      technique: 'Proxy Upgrade Hijack',
      targetType: 'DeFi Protocol',
      returnedFunds: null,
      defillamaId: '970',
      parentProtocolId: 'parent#drift',
    });
    const ratio = rows.find((r) => r.name === 'Ratio Finance')!;
    expect(ratio.amount).toBeNull();
    expect(rows.find((r) => r.name === 'DoodiPals')!.defillamaId).toBeNull();
    expect(rows.at(-1)!.returnedFunds).toBe(14_500_000);
  });
});
