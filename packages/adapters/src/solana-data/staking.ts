/**
 * Liquid staking on Solana, from Solana Compass's public API.
 *
 * Verified 2026-10-10: `GET /api/v1/lsts?offset=N&limit=50`, no key, 60 requests
 * a minute, 217 pools sorted by stake. `limit` above 50 is rejected and `page`
 * is ignored — `offset` is what paginates. Solana Compass asks for a credit
 * link wherever its data is shown.
 *
 * Fees arrive as `{numerator, denominator}` pairs: Jito's epoch fee is
 * 4/100, its withdrawal fee 1/1000. A `0/0` pair means no fee is charged.
 */

import type { StakePool } from '@marketroom/core';
import { getJson, num } from '../http';

const API = 'https://solanacompass.com/api/v1/lsts';
const SITE = 'https://solanacompass.com';
const PAGE = 50;

interface WireFee {
  numerator?: number | null;
  denominator?: number | null;
}

interface WirePool {
  address?: string;
  poolMint?: string | null;
  name?: string | null;
  website?: string | null;
  logo?: string | null;
  logo_cached?: string | null;
  totalLamports?: number | string | null;
  ratio_apy?: number | null;
  epoch_fee?: WireFee | null;
  sol_deposit_fee?: WireFee | null;
  sol_withdrawal_fee?: WireFee | null;
  validatorsCount?: number | null;
  data_stale?: boolean | null;
  updated_at?: string | null;
}

/** A fee pair as a fraction. `0/0` is no fee; a missing pair is unknown. */
export function feeFraction(fee: WireFee | null | undefined): number | null {
  if (!fee) return null;
  const n = num(fee.numerator);
  const d = num(fee.denominator);
  if (n === null || d === null) return null;
  if (d === 0) return n === 0 ? 0 : null;
  return n / d;
}

const LAMPORTS_PER_SOL = 1e9;

function absolute(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE}/${path.replace(/^\//, '')}`;
}

function mapPool(p: WirePool): StakePool | null {
  if (!p.address) return null;
  const lamports = num(p.totalLamports);
  const updated = p.updated_at ? Date.parse(p.updated_at) : NaN;
  return {
    address: p.address,
    mint: p.poolMint ?? null,
    name: p.name?.trim() || null,
    // Strip the source's referral parameter: our link is a citation, not an affiliate.
    website: p.website ? p.website.replace(/[?&]ref=compass$/, '') : null,
    logo: absolute(p.logo_cached ?? p.logo),
    solStaked: lamports === null ? null : lamports / LAMPORTS_PER_SOL,
    apy: num(p.ratio_apy),
    epochFee: feeFraction(p.epoch_fee),
    depositFee: feeFraction(p.sol_deposit_fee),
    withdrawFee: feeFraction(p.sol_withdrawal_fee),
    validators: num(p.validatorsCount),
    stale: Boolean(p.data_stale),
    updatedAt: Number.isFinite(updated) ? updated : null,
  };
}

export class SolanaCompassStaking {
  constructor(private readonly options: { signal?: AbortSignal } = {}) {}

  /** Every liquid-staking pool, largest first. Five requests for ~217 pools. */
  async pools(maxPages = 8): Promise<StakePool[]> {
    const out: StakePool[] = [];
    for (let page = 0; page < maxPages; page++) {
      const d = await getJson<{ data?: WirePool[]; meta?: { total?: number } }>(
        `${API}?offset=${page * PAGE}&limit=${PAGE}`,
        { signal: this.options.signal, timeoutMs: 15_000, retries: 1 },
      );
      const rows = d.data ?? [];
      out.push(...rows.map(mapPool).filter((p): p is StakePool => p !== null));
      const total = num(d.meta?.total);
      if (rows.length < PAGE || (total !== null && out.length >= total)) break;
    }
    return out;
  }
}
