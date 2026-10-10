/**
 * Token markets and sentiment.
 *
 * Primary: Jupiter's token API — Solana-native and free, keyed by mint, with
 * price, supply, liquidity, holders, trader counts and an organic-volume
 * score, plus ready-made trending / top-traded / top-organic lists.
 *
 * Optional: CoinGecko, for all-time highs and a 7-day sparkline, used only
 * when `COINGECKO_API_KEY` is set. Its keyless tier answered HTTP 429 after a
 * handful of calls in testing, so this adapter never calls it without a key —
 * an enrichment that fails most of the time is noise, not data.
 *
 * Fear & Greed from alternative.me — market-wide, labelled as such.
 */

import type { FearGreed, TokenMarket } from '@marketroom/core';
import { getJson, num } from '../http';

const JUPITER = 'https://lite-api.jup.ag/tokens/v2';
const COINGECKO = 'https://api.coingecko.com/api/v3';

/** Wrapped SOL's mint — how SOL itself is addressed on Jupiter. */
export const SOL_MINT = 'So11111111111111111111111111111111111111112';

/** Mints per search request. */
const MINTS_PER_REQUEST = 50;

interface WireJupStats {
  priceChange?: number | null;
  buyVolume?: number | null;
  sellVolume?: number | null;
  numTraders?: number | null;
}

interface WireJupToken {
  id: string;
  symbol?: string;
  name?: string;
  icon?: string | null;
  usdPrice?: number | null;
  mcap?: number | null;
  fdv?: number | null;
  liquidity?: number | null;
  holderCount?: number | null;
  organicScore?: number | null;
  isVerified?: boolean | null;
  circSupply?: number | null;
  totalSupply?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  stats1h?: WireJupStats;
  stats24h?: WireJupStats;
  decimals?: number | null;
  tokenProgram?: string | null;
}

interface WireGecko {
  id: string;
  symbol?: string;
  name?: string;
  image?: string | null;
  current_price?: number | null;
  market_cap?: number | null;
  fully_diluted_valuation?: number | null;
  total_volume?: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  circulating_supply?: number | null;
  total_supply?: number | null;
  max_supply?: number | null;
  ath?: number | null;
  ath_date?: string | null;
  sparkline_in_7d?: { price?: number[] } | null;
  last_updated?: string | null;
}

const pct = (value: unknown) => {
  const n = num(value);
  return n === null ? null : n / 100;
};

const iso = (value: string | null | undefined) => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

function fromJupiter(t: WireJupToken): TokenMarket {
  const buy = num(t.stats24h?.buyVolume);
  const sell = num(t.stats24h?.sellVolume);
  return {
    key: t.id,
    mint: t.id,
    geckoId: null,
    symbol: (t.symbol ?? '').trim(),
    name: (t.name ?? t.symbol ?? t.id).trim(),
    image: t.icon ?? null,
    price: num(t.usdPrice),
    marketCap: num(t.mcap),
    fdv: num(t.fdv),
    volume24h: buy === null && sell === null ? null : (buy ?? 0) + (sell ?? 0),
    change1h: pct(t.stats1h?.priceChange),
    change24h: pct(t.stats24h?.priceChange),
    change7d: null,
    circulatingSupply: num(t.circSupply),
    totalSupply: num(t.totalSupply),
    maxSupply: null,
    ath: null,
    athDate: null,
    liquidity: num(t.liquidity),
    holders: num(t.holderCount),
    traders24h: num(t.stats24h?.numTraders),
    organicScore: num(t.organicScore),
    verified: typeof t.isVerified === 'boolean' ? t.isVerified : null,
    createdAt: iso(t.createdAt),
    sparkline: [],
    updatedAt: iso(t.updatedAt),
    decimals: num(t.decimals),
    tokenProgram: t.tokenProgram ?? null,
  };
}

function fromGecko(m: WireGecko): TokenMarket {
  return {
    key: `cg:${m.id}`,
    mint: null,
    geckoId: m.id,
    symbol: (m.symbol ?? '').toUpperCase(),
    name: m.name ?? m.id,
    image: m.image ?? null,
    price: num(m.current_price),
    marketCap: num(m.market_cap) || null,
    fdv: num(m.fully_diluted_valuation),
    volume24h: num(m.total_volume),
    change1h: null,
    change24h: pct(m.price_change_percentage_24h_in_currency),
    change7d: pct(m.price_change_percentage_7d_in_currency),
    circulatingSupply: num(m.circulating_supply),
    totalSupply: num(m.total_supply),
    maxSupply: num(m.max_supply),
    ath: num(m.ath),
    athDate: iso(m.ath_date),
    liquidity: null,
    holders: null,
    traders24h: null,
    organicScore: null,
    verified: null,
    createdAt: null,
    sparkline: (m.sparkline_in_7d?.price ?? []).filter((p) => Number.isFinite(p)),
    updatedAt: iso(m.last_updated),
    decimals: null,
    tokenProgram: null,
  };
}

/**
 * Jupiter's market, with CoinGecko's history laid over it where both exist.
 *
 * Jupiter wins on everything it reports — it is the on-chain source. CoinGecko
 * contributes only what Jupiter does not have: the all-time high, the 7-day
 * change and the sparkline.
 */
export function enrichMarket(jupiter: TokenMarket, gecko: TokenMarket | undefined): TokenMarket {
  if (!gecko) return jupiter;
  return {
    ...jupiter,
    geckoId: gecko.geckoId,
    change7d: jupiter.change7d ?? gecko.change7d,
    maxSupply: jupiter.maxSupply ?? gecko.maxSupply,
    ath: gecko.ath,
    athDate: gecko.athDate,
    sparkline: gecko.sparkline,
  };
}

export type JupiterList = 'toptrending' | 'toptraded' | 'toporganicscore';

export class SolanaMarkets {
  constructor(
    private readonly options: { signal?: AbortSignal; coingeckoKey?: string | null } = {},
  ) {}

  /** Tokens by mint, in batches. */
  async byMints(mints: readonly string[]): Promise<TokenMarket[]> {
    const unique = [...new Set(mints.filter(Boolean))];
    const out: TokenMarket[] = [];
    for (let i = 0; i < unique.length; i += MINTS_PER_REQUEST) {
      const chunk = unique.slice(i, i + MINTS_PER_REQUEST);
      const rows = await getJson<WireJupToken[]>(
        `${JUPITER}/search?query=${encodeURIComponent(chunk.join(','))}`,
        { signal: this.options.signal, timeoutMs: 15_000, retries: 1 },
      );
      if (Array.isArray(rows))
        out.push(...rows.filter((r) => chunk.includes(r.id)).map(fromJupiter));
    }
    return out;
  }

  /** One of Jupiter's ranked lists over the last 24 hours. */
  async list(kind: JupiterList, limit = 100): Promise<TokenMarket[]> {
    const rows = await getJson<WireJupToken[]>(`${JUPITER}/${kind}/24h?limit=${limit}`, {
      signal: this.options.signal,
      timeoutMs: 15_000,
      retries: 1,
    });
    return Array.isArray(rows) ? rows.map(fromJupiter) : [];
  }

  /** CoinGecko markets by id. Empty — without a request — when no key is configured. */
  async geckoByIds(ids: readonly string[]): Promise<TokenMarket[]> {
    const key = this.options.coingeckoKey;
    if (!key || ids.length === 0) return [];
    const unique = [...new Set(ids)];
    const out: TokenMarket[] = [];
    for (let i = 0; i < unique.length; i += 250) {
      const chunk = unique.slice(i, i + 250);
      const rows = await getJson<WireGecko[]>(
        `${COINGECKO}/coins/markets?vs_currency=usd&ids=${chunk.map(encodeURIComponent).join(',')}` +
          `&per_page=250&sparkline=true&price_change_percentage=24h,7d&x_cg_demo_api_key=${encodeURIComponent(key)}`,
        { signal: this.options.signal, timeoutMs: 20_000, retries: 1 },
      );
      if (Array.isArray(rows)) out.push(...rows.map(fromGecko));
    }
    return out;
  }

  /** Market-wide Fear & Greed, 0–100. */
  async fearGreed(): Promise<FearGreed | null> {
    const d = await getJson<{
      data?: { value?: string; value_classification?: string; timestamp?: string }[];
    }>('https://api.alternative.me/fng/?limit=1', {
      signal: this.options.signal,
      timeoutMs: 10_000,
    });
    const row = d.data?.[0];
    const value = num(row?.value);
    if (!row || value === null) return null;
    return {
      value,
      label: row.value_classification ?? '',
      at: (num(row.timestamp) ?? 0) * 1000,
    };
  }
}
