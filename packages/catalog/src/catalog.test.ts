import { describe, expect, it } from 'vitest';
import { ASSET_ENTRIES } from './assets/index';
import { allAssets, assetById, knownVenueSymbols, listingIdFor, resolveAssetId, solanaListingSeeds } from './index';

/**
 * Catalog integrity.
 *
 * The catalog is hand-maintained by two people working in parallel, so these
 * tests guard the invariants that a careless copy-paste would break — and that
 * would otherwise surface as silently wrong data rather than as an error.
 */

describe('catalog integrity', () => {
  it('has a non-trivial universe', () => {
    expect(allAssets().length).toBeGreaterThan(100);
  });

  it('has unique asset ids', () => {
    const ids = ASSET_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('derives every id from its symbol, so lookups are predictable', () => {
    for (const entry of ASSET_ENTRIES) {
      expect(entry.id).toBe(entry.symbol.toLowerCase().replace(/[^a-z0-9]/g, ''));
    }
  });

  it('never maps one venue symbol to two assets', () => {
    const seen = new Map<string, string>();
    for (const entry of ASSET_ENTRIES) {
      for (const symbol of entry.hyperliquid ?? []) {
        const existing = seen.get(symbol);
        expect(existing, `Hyperliquid symbol "${symbol}" is claimed by both ${existing} and ${entry.id}`).toBeUndefined();
        seen.set(symbol, entry.id);
      }
    }
  });

  it('never reuses a Solana mint across assets', () => {
    const mints = solanaListingSeeds().map((seed) => seed.mint);
    expect(new Set(mints).size).toBe(mints.length);
  });

  it('gives every asset a sector and an industry', () => {
    for (const entry of ASSET_ENTRIES) {
      expect(entry.taxonomy.sector, entry.id).toBeTruthy();
      expect(entry.taxonomy.industry, entry.id).toBeTruthy();
    }
  });

  it('gives every asset an editorial summary', () => {
    for (const entry of ASSET_ENTRIES) {
      expect(entry.summary.length, `${entry.id} has no summary`).toBeGreaterThan(40);
    }
  });

  it('only references peers that exist — a typo would render a dead chip', () => {
    for (const entry of ASSET_ENTRIES) {
      for (const peer of entry.peers) {
        expect(assetById(peer), `${entry.id} lists unknown peer "${peer}"`).toBeDefined();
      }
    }
  });

  it('reports no P/E for private companies rather than inventing one', () => {
    for (const entry of ASSET_ENTRIES) {
      if (entry.isPrivate) expect(entry.peRatio, entry.id).toBeNull();
    }
  });

  it('maps every asset to at least one venue', () => {
    for (const entry of ASSET_ENTRIES) {
      const count = (entry.hyperliquid?.length ?? 0) + (entry.solana?.length ?? 0);
      expect(count, `${entry.id} is listed nowhere`).toBeGreaterThan(0);
    }
  });
});

describe('resolveAssetId', () => {
  it('resolves a venue ticker to its canonical asset', () => {
    expect(resolveAssetId('hyperliquid', 'NVDA')).toBe('nvda');
  });

  it('is case-insensitive', () => {
    expect(resolveAssetId('hyperliquid', 'nvda')).toBe('nvda');
  });

  it('resolves venue symbols that differ from the display ticker', () => {
    // The reference called these SKHYNIX / SAMSUNG / WTIOIL, which match no
    // real market id on the venue.
    expect(resolveAssetId('hyperliquid', 'SKHX')).toBe('skhx');
    expect(resolveAssetId('hyperliquid', 'SMSN')).toBe('smsn');
    expect(resolveAssetId('hyperliquid', 'CL')).toBe('cl');
  });

  it('returns undefined for an unknown symbol instead of throwing', () => {
    expect(resolveAssetId('hyperliquid', 'NOTREAL')).toBeUndefined();
  });

  it('resolves a Solana mint', () => {
    const seed = solanaListingSeeds()[0]!;
    expect(resolveAssetId('solana', seed.mint)).toBe(seed.assetId);
  });
});

describe('listingIdFor', () => {
  it('namespaces by venue so ids are globally unique', () => {
    expect(listingIdFor('hyperliquid', 'xyz:NVDA')).toBe('hyperliquid:xyz:NVDA');
    expect(listingIdFor('solana', 'Xsc9')).toBe('solana:Xsc9');
  });
});

describe('knownVenueSymbols', () => {
  it('lists the symbols the coverage check compares against', () => {
    const symbols = knownVenueSymbols('hyperliquid');
    expect(symbols.length).toBeGreaterThan(100);
    expect(symbols).toContain('NVDA');
  });
});
