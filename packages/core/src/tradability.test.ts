import { describe, expect, it } from 'vitest';
import { venueSpread } from './derive';
import {
  DEAD_POOL_USD,
  REFERENCE_NOTIONAL_USD,
  isQuotable,
  organicShare,
  tradabilityOf,
  untradableListings,
} from './tradability';
import type { AssetView, Listing, ListingQuote, Quote, VenueId } from './types';

const listing = (id: string, venue: VenueId): Listing => ({
  id,
  assetId: 'asml',
  venue,
  venueSymbol: id,
  kind: venue === 'hyperliquid' ? 'perpetual' : 'tokenized-equity',
  maxLeverage: venue === 'hyperliquid' ? 20 : 1,
  rights: { ownership: false, dividends: false, voting: false, redeemable: false },
  issuer: null,
  tradeUrl: '',
  onchainAddress: null,
  redemption: null,
  eligibility: null,
  backing: null,
  sources: [],
});

const quote = (over: Partial<Quote> = {}): Quote => ({
  listingId: 'q',
  price: 100,
  prevDayPrice: 100,
  volume24h: null,
  openInterest: null,
  liquidity: null,
  fundingRate: null,
  oraclePrice: null,
  fdv: null,
  holders: null,
  premium: null,
  impactPrices: null,
  organicVolume24h: null,
  tradeCount24h: null,
  tradeCount1h: null,
  observedAt: 0,
  venueObservedAt: null,
  ...over,
});

const entry = (venue: VenueId, over: Partial<Quote> = {}): ListingQuote => ({
  listing: listing(venue, venue),
  quote: quote(over),
});

const view = (listings: ListingQuote[]): AssetView =>
  ({
    asset: { id: 'asml', symbol: 'ASML' },
    listings,
  }) as unknown as AssetView;

describe('tradabilityOf', () => {
  it('marks a pool below the dead threshold as dead', () => {
    const t = tradabilityOf(entry('solana', { liquidity: 107.12 }));
    expect(t.state).toBe('dead');
    expect(isQuotable(t)).toBe(false);
    expect(t.reasons[0]).toContain('$107');
  });

  it('treats an empty pool as dead', () => {
    expect(tradabilityOf(entry('solana', { liquidity: 0 })).state).toBe('dead');
  });

  it('marks a pool that the reference trade would dominate as limited', () => {
    // $16.4k pool — a $10k order is most of it, whatever the curve looks like.
    const t = tradabilityOf(entry('solana', { liquidity: 16_407 }));
    expect(t.state).toBe('limited');
    expect(isQuotable(t)).toBe(false);
  });

  it('does not conclude anything from a deep pool', () => {
    // Deliberately `unmeasured`, not `ok`: pool size bounds tradability from
    // below only. Real depth needs the impact curve.
    const t = tradabilityOf(entry('solana', { liquidity: 1_450_000 }));
    expect(t.state).toBe('unmeasured');
    expect(isQuotable(t)).toBe(true);
  });

  it('never reads a missing pool figure as an empty one', () => {
    // A perp has no pool. `null` liquidity must not be treated as zero, or
    // every derivative in the index would be condemned as dead.
    const t = tradabilityOf(entry('hyperliquid', { liquidity: null }));
    expect(t.state).toBe('unmeasured');
  });

  it('is dead when no usable price is reported', () => {
    expect(tradabilityOf({ listing: listing('x', 'solana'), quote: null }).state).toBe('dead');
    expect(tradabilityOf(entry('solana', { price: 0 })).state).toBe('dead');
  });

  it('notes a total absence of trades without condemning the listing', () => {
    const t = tradabilityOf(entry('solana', { liquidity: 500_000, tradeCount24h: 0 }));
    expect(t.state).toBe('unmeasured');
    expect(t.reasons.join(' ')).toContain('No trades');
  });

  it('states its assessment against the published reference size', () => {
    expect(tradabilityOf(entry('solana')).referenceNotional).toBe(REFERENCE_NOTIONAL_USD);
    expect(DEAD_POOL_USD).toBeLessThan(REFERENCE_NOTIONAL_USD);
  });
});

describe('organicShare', () => {
  it('returns the venue-classified share', () => {
    const share = organicShare(entry('solana', { volume24h: 517_563, organicVolume24h: 15_569 }));
    expect(share).toBeCloseTo(0.0301, 4);
  });

  it('returns null rather than guessing when unclassified', () => {
    expect(organicShare(entry('solana', { volume24h: 1000, organicVolume24h: null }))).toBeNull();
    expect(organicShare(entry('solana', { volume24h: 0, organicVolume24h: 0 }))).toBeNull();
  });
});

describe('venueSpread comparability', () => {
  // The case this gate was written for. Measured on 2026-10-04: ASML quoted
  // $1,973.37 on Solana against $1,867.70 on Hyperliquid — a 5.66% gap the
  // product published as a headline "apart" badge, with $107 of liquidity
  // behind the expensive leg.
  const asml = view([
    { listing: listing('hyperliquid', 'hyperliquid'), quote: quote({ price: 1867.7 }) },
    {
      listing: listing('solana', 'solana'),
      quote: quote({ price: 1973.37, liquidity: 107.12, tradeCount24h: 4 }),
    },
  ]);

  it('still reports the gap', () => {
    const spread = venueSpread(asml);
    expect(spread).not.toBeNull();
    expect(spread!.fraction).toBeCloseTo(0.0566, 3);
  });

  it('refuses to call it comparable', () => {
    const spread = venueSpread(asml)!;
    expect(spread.comparable).toBe(false);
    expect(spread.reasons.join(' ')).toContain('solana');
    expect(spread.reasons.join(' ')).toContain('$107');
  });

  it('calls a gap between two liquid legs comparable', () => {
    const healthy = view([
      {
        listing: listing('hyperliquid', 'hyperliquid'),
        quote: quote({ price: 100, liquidity: null }),
      },
      { listing: listing('solana', 'solana'), quote: quote({ price: 101, liquidity: 1_450_000 }) },
    ]);
    const spread = venueSpread(healthy)!;
    expect(spread.comparable).toBe(true);
    expect(spread.reasons).toHaveLength(0);
  });

  it('keeps suppressing implausible gaps entirely', () => {
    const broken = view([
      { listing: listing('hyperliquid', 'hyperliquid'), quote: quote({ price: 100 }) },
      { listing: listing('solana', 'solana'), quote: quote({ price: 1083, liquidity: 5_000_000 }) },
    ]);
    expect(venueSpread(broken)).toBeNull();
  });
});

describe('untradableListings', () => {
  it('picks out the legs that cannot carry an unqualified price', () => {
    const mixed = view([
      {
        listing: listing('hyperliquid', 'hyperliquid'),
        quote: quote({ price: 100, liquidity: null }),
      },
      { listing: listing('solana', 'solana'), quote: quote({ price: 101, liquidity: 107 }) },
    ]);
    const bad = untradableListings(mixed);
    expect(bad).toHaveLength(1);
    expect(bad[0]!.listing.venue).toBe('solana');
  });
});

describe('missing liquidity means opposite things by instrument', () => {
  // CRWVx, 2026-10-04: Jupiter returned a price of $85.51 with no `liquidity`
  // field and no `stats24h` at all. Read as "unknown" it ranked as the largest
  // dislocation on the homepage; read correctly it is a dead listing.
  it('treats an absent pool figure as dead for a pool-backed token', () => {
    const t = tradabilityOf({
      listing: { ...listing('solana', 'solana'), kind: 'tokenized-equity' },
      quote: quote({ price: 85.51, liquidity: null }),
    });
    expect(t.state).toBe('dead');
    expect(t.reasons.join(' ')).toContain('No liquidity pool');
  });

  it('treats an absent pool figure as uninformative for a perp', () => {
    const t = tradabilityOf({
      listing: { ...listing('hyperliquid', 'hyperliquid'), kind: 'perpetual' },
      quote: quote({ price: 89.44, liquidity: null }),
    });
    expect(t.state).toBe('unmeasured');
  });

  it('excludes a token with no pool from a cross-venue comparison', () => {
    const crwv = view([
      {
        listing: { ...listing('hyperliquid', 'hyperliquid'), kind: 'perpetual' },
        quote: quote({ price: 89.44, liquidity: null }),
      },
      {
        listing: { ...listing('solana', 'solana'), kind: 'tokenized-equity' },
        quote: quote({ price: 85.51, liquidity: null }),
      },
    ]);
    expect(venueSpread(crwv)!.comparable).toBe(false);
  });
});
