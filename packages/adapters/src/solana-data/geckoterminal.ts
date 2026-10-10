/**
 * Token price history, from GeckoTerminal.
 *
 * Free and keyless (about 30 requests a minute): a token's pools ranked by
 * liquidity, and daily OHLCV for a pool. Price history is read from the
 * token's deepest pool and labelled with that pool, because a token's price
 * is only ever some pool's price.
 *
 * Verified 2026-10-10: /networks/solana/tokens/{mint}/pools and
 * /networks/solana/pools/{pool}/ohlcv/day (≈ 180 daily candles per request).
 */

import { getJson, HttpError, num } from '../http';

const API = 'https://api.geckoterminal.com/api/v2';

export interface PoolRef {
  readonly address: string;
  readonly name: string;
  readonly dex: string | null;
  readonly reserveUsd: number | null;
  readonly volume24h: number | null;
  /** Whether the token is the pool's base token (its price is quoted against the other). */
  readonly tokenIsBase: boolean;
}

export interface DailyCandle {
  /** Epoch ms, start of the UTC day. */
  readonly t: number;
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
  readonly v: number;
}

interface WirePools {
  data?: {
    attributes?: {
      address?: string;
      name?: string;
      reserve_in_usd?: string | number | null;
      volume_usd?: { h24?: string | number | null };
    };
    relationships?: {
      base_token?: { data?: { id?: string } };
      dex?: { data?: { id?: string } };
    };
  }[];
}

interface WireOhlcv {
  data?: { attributes?: { ohlcv_list?: [number, number, number, number, number, number][] } };
}

export function parsePools(mint: string, wire: WirePools): PoolRef[] {
  return (wire.data ?? [])
    .map((p) => ({
      address: p.attributes?.address ?? '',
      name: p.attributes?.name ?? '',
      dex: p.relationships?.dex?.data?.id ?? null,
      reserveUsd: num(p.attributes?.reserve_in_usd),
      volume24h: num(p.attributes?.volume_usd?.h24),
      tokenIsBase: p.relationships?.base_token?.data?.id === `solana_${mint}`,
    }))
    .filter((p) => p.address)
    .sort((a, b) => (b.reserveUsd ?? 0) - (a.reserveUsd ?? 0));
}

export function parseOhlcv(wire: WireOhlcv): DailyCandle[] {
  return (wire.data?.attributes?.ohlcv_list ?? [])
    .map(([t, o, h, l, c, v]) => ({ t: t * 1000, o, h, l, c, v }))
    .filter((x) => [x.o, x.h, x.l, x.c].every((n) => Number.isFinite(n) && n > 0))
    .sort((a, b) => a.t - b.t);
}

export class GeckoTerminal {
  constructor(private readonly options: { signal?: AbortSignal } = {}) {}

  /** The token's pools on Solana, deepest first; none for a token it does not list. */
  async pools(mint: string): Promise<PoolRef[]> {
    try {
      const wire = await getJson<WirePools>(
        `${API}/networks/solana/tokens/${encodeURIComponent(mint)}/pools?page=1`,
        { signal: this.options.signal, timeoutMs: 15_000, retries: 1 },
      );
      return parsePools(mint, wire);
    } catch (e) {
      // An unlisted token is an answer, not a failure.
      if (e instanceof HttpError && e.status === 404) return [];
      throw e;
    }
  }

  /** Daily candles for the token, priced in USD, from one pool. */
  async daily(pool: PoolRef, limit = 365): Promise<DailyCandle[]> {
    const wire = await getJson<WireOhlcv>(
      `${API}/networks/solana/pools/${encodeURIComponent(pool.address)}/ohlcv/day?limit=${limit}&currency=usd&token=${pool.tokenIsBase ? 'base' : 'quote'}`,
      { signal: this.options.signal, timeoutMs: 15_000, retries: 1 },
    );
    return parseOhlcv(wire);
  }
}
