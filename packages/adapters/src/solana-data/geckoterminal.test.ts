import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeckoTerminal, parseOhlcv, parsePools } from './geckoterminal';

const MINT = 'KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS';

describe('GeckoTerminal parsing', () => {
  it('ranks pools by liquidity and knows which side the token is on', () => {
    const pools = parsePools(MINT, {
      data: [
        {
          attributes: { address: 'small', name: 'KMNO / JitoSOL', reserve_in_usd: '257655.41' },
          relationships: {
            base_token: { data: { id: `solana_${MINT}` } },
            dex: { data: { id: 'orca' } },
          },
        },
        {
          attributes: {
            address: 'deep',
            name: 'USDC / KMNO',
            reserve_in_usd: '1866180.9',
            volume_usd: { h24: '1747462' },
          },
          relationships: { base_token: { data: { id: 'solana_EPjF' } } },
        },
      ],
    });
    expect(pools.map((p) => p.address)).toEqual(['deep', 'small']);
    expect(pools[0]).toMatchObject({ tokenIsBase: false, volume24h: 1747462 });
    expect(pools[1]).toMatchObject({ tokenIsBase: true, dex: 'orca' });
  });

  it('turns OHLCV rows into ascending candles in milliseconds, dropping empty ones', () => {
    const candles = parseOhlcv({
      data: {
        attributes: {
          ohlcv_list: [
            [1791590400, 0.0347, 0.0362, 0.0338, 0.0354, 12000],
            [1791504000, 0, 0, 0, 0, 0],
            [1791417600, 0.033, 0.035, 0.032, 0.0347, 9000],
          ],
        },
      },
    });
    expect(candles.map((c) => c.t)).toEqual([1791417600000, 1791590400000]);
    expect(candles[1]).toMatchObject({ o: 0.0347, c: 0.0354, v: 12000 });
  });
});

describe('GeckoTerminal requests', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads a token it does not list as having no pools, and lets a real failure through', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response('{"errors":[{"status":"404"}]}', { status: 404 }),
    );
    await expect(
      new GeckoTerminal().pools('So11111111111111111111111111111111111111112'),
    ).resolves.toEqual([]);

    vi.stubGlobal(
      'fetch',
      async () => new Response('{"status":{"error_code":429}}', { status: 429 }),
    );
    await expect(
      new GeckoTerminal().pools('So11111111111111111111111111111111111111112'),
    ).rejects.toThrow();
  });
});
