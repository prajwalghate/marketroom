/**
 * Catalog entry types.
 *
 * The catalog is the curated layer that no API provides: sector, country,
 * company identity, editorial context, peers, and the venue-symbol mappings
 * that join live market data to a canonical asset.
 *
 * ⚠️ Structural rule, and the single biggest lever for parallel work:
 * **one file per asset** under `src/assets/`. Two people adding NVDA and GOLD
 * touch two different files, so git never has to merge them. Do not consolidate
 * these into a single array — that reintroduces exactly the conflict this
 * layout exists to prevent.
 */

import type { AssetClass, Taxonomy } from '@marketroom/core';

/** A Solana SPL token listing. Keyed by mint, never by symbol. */
export interface SolanaListingSeed {
  /** The SPL mint address — the only safe identifier on a permissionless chain. */
  readonly mint: string;
  /** Who issues and custodies the backing shares. */
  readonly issuer: string;
}

export interface CatalogEntry {
  /** Canonical lowercase id. Must match the filename. */
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly assetClass: AssetClass;
  readonly taxonomy: Taxonomy;
  /** ISO-3166 alpha-2, `US/AU` for duals, `null` for non-national assets. */
  readonly country: string | null;
  readonly summary: string;
  readonly peers: readonly string[];
  readonly isPrivate: boolean;
  readonly peRatio: number | null;

  /**
   * Venue symbol mappings.
   *
   * Hyperliquid tickers are stored bare (`NVDA`), not namespaced (`xyz:NVDA`) —
   * the adapter strips the dex prefix before lookup. Note the venue's symbols
   * frequently differ from the display ticker: SK hynix is `SKHX`, Samsung is
   * `SMSN`, WTI crude is `CL`.
   */
  readonly hyperliquid?: readonly string[];
  readonly solana?: readonly SolanaListingSeed[];
}

/** Compile-time identity helper, so entry files get full type-checking. */
export const defineAsset = (entry: CatalogEntry): CatalogEntry => entry;
