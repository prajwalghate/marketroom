import { describe, expect, it } from 'vitest';
import {
  aggregateVolume24h,
  bookSpread,
  consolidatedPrice,
  directionOf,
  normalizeCloses,
  priceChange24h,
  primaryListing,
  venueSpread,
} from './derive';
import type { AssetView, Asset, Listing, Quote } from './types';

/**
 * Tests concentrate on the cases that are easy to get silently wrong:
 * missing data, division by zero, float noise around zero, and the cross-venue
 * aggregations that only exist because of the Asset/Listing split.
 */

const asset: Asset = {
  id: 'nvda',
  symbol: 'NVDA',
  name: 'NVIDIA Corporation',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Semiconductors' },
  country: 'US',
  summary: '',
  peers: [],
  isPrivate: false,
  peRatio: 50,
};

const listing = (id: string, venue: 'hyperliquid' | 'solana'): Listing => ({
  id,
  assetId: 'nvda',
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

const quote = (listingId: string, over: Partial<Quote> = {}): Quote => ({
  listingId,
  price: 100,
  prevDayPrice: 100,
  volume24h: null,
  openInterest: null,
  liquidity: null,
  fundingRate: null,
  oraclePrice: null,
  fdv: null,
  holders: null,
  observedAt: 0,
  ...over,
});

const view = (listings: AssetView['listings']): AssetView => ({ asset, listings });

describe('priceChange24h', () => {
  it('computes a fraction, not a percentage', () => {
    const change = priceChange24h(quote('a', { price: 102, prevDayPrice: 100 }));
    expect(change?.fraction).toBeCloseTo(0.02);
    expect(change?.direction).toBe('up');
  });

  it('returns null when there is no reference price, rather than reporting 0%', () => {
    expect(priceChange24h(quote('a', { prevDayPrice: null }))).toBeNull();
  });

  it('returns null on a zero reference price instead of dividing by zero', () => {
    expect(priceChange24h(quote('a', { prevDayPrice: 0 }))).toBeNull();
  });
});

describe('directionOf', () => {
  it('treats float noise as flat so prices do not flicker on every tick', () => {
    expect(directionOf(1e-12)).toBe('flat');
    expect(directionOf(-1e-12)).toBe('flat');
  });

  it('still resolves genuine movement', () => {
    expect(directionOf(0.01)).toBe('up');
    expect(directionOf(-0.01)).toBe('down');
  });
});

describe('aggregateVolume24h', () => {
  it('sums across venues', () => {
    const result = aggregateVolume24h(
      view([
        { listing: listing('a', 'hyperliquid'), quote: quote('a', { volume24h: 1000 }) },
        { listing: listing('b', 'solana'), quote: quote('b', { volume24h: 250 }) },
      ]),
    );
    expect(result).toBe(1250);
  });

  it('returns null when no venue reports volume — not 0, which would be a lie', () => {
    const result = aggregateVolume24h(
      view([{ listing: listing('a', 'hyperliquid'), quote: quote('a') }]),
    );
    expect(result).toBeNull();
  });

  it('ignores venues with missing values but keeps the ones that have them', () => {
    const result = aggregateVolume24h(
      view([
        { listing: listing('a', 'hyperliquid'), quote: quote('a', { volume24h: 500 }) },
        { listing: listing('b', 'solana'), quote: null },
      ]),
    );
    expect(result).toBe(500);
  });
});

describe('primaryListing', () => {
  it('prefers the venue with the most volume', () => {
    const result = primaryListing(
      view([
        { listing: listing('a', 'hyperliquid'), quote: quote('a', { volume24h: 10 }) },
        { listing: listing('b', 'solana'), quote: quote('b', { volume24h: 900 }) },
      ]),
    );
    expect(result?.listing.id).toBe('b');
  });

  it('falls back to a listing with no quote so an asset is never dropped', () => {
    const result = primaryListing(view([{ listing: listing('a', 'hyperliquid'), quote: null }]));
    expect(result?.listing.id).toBe('a');
  });
});

describe('consolidatedPrice', () => {
  it('weights by volume', () => {
    const result = consolidatedPrice(
      view([
        { listing: listing('a', 'hyperliquid'), quote: quote('a', { price: 100, volume24h: 900 }) },
        { listing: listing('b', 'solana'), quote: quote('b', { price: 200, volume24h: 100 }) },
      ]),
    );
    expect(result).toBeCloseTo(110);
  });

  it('falls back to a raw price when nothing has volume', () => {
    const result = consolidatedPrice(
      view([{ listing: listing('a', 'hyperliquid'), quote: quote('a', { price: 42 }) }]),
    );
    expect(result).toBe(42);
  });
});

describe('venueSpread', () => {
  it('needs at least two quoted venues', () => {
    expect(
      venueSpread(view([{ listing: listing('a', 'hyperliquid'), quote: quote('a') }])),
    ).toBeNull();
  });

  it('measures the gap as a fraction of the lower price', () => {
    const spread = venueSpread(
      view([
        { listing: listing('a', 'hyperliquid'), quote: quote('a', { price: 100 }) },
        { listing: listing('b', 'solana'), quote: quote('b', { price: 101 }) },
      ]),
    );
    expect(spread?.fraction).toBeCloseTo(0.01);
    expect(spread?.low.listing.id).toBe('a');
    expect(spread?.high.listing.id).toBe('b');
  });

  it('suppresses implausible gaps, which indicate a bad catalog mapping', () => {
    // Regression: sp500 (index level ~7193) was mapped to SPYx (ETF ~769),
    // which rendered as a ~983% arbitrage opportunity.
    const spread = venueSpread(
      view([
        { listing: listing('a', 'hyperliquid'), quote: quote('a', { price: 7193 }) },
        { listing: listing('b', 'solana'), quote: quote('b', { price: 769 }) },
      ]),
    );
    expect(spread).toBeNull();
  });
});

describe('bookSpread', () => {
  it('computes mid and fraction', () => {
    const spread = bookSpread({
      listingId: 'a',
      bids: [{ price: 99, size: 1, count: 1 }],
      asks: [{ price: 101, size: 1, count: 1 }],
      observedAt: 0,
    });
    expect(spread?.mid).toBe(100);
    expect(spread?.fraction).toBeCloseTo(0.02);
  });

  it('returns null for an empty side rather than NaN', () => {
    expect(bookSpread({ listingId: 'a', bids: [], asks: [], observedAt: 0 })).toBeNull();
  });
});

describe('normalizeCloses', () => {
  it('maps a flat series to the mid-line instead of dividing by zero', () => {
    const candles = [5, 5, 5].map((close, index) => ({
      time: index,
      open: close,
      high: close,
      low: close,
      close,
      volume: 0,
    }));
    expect(normalizeCloses(candles)).toEqual([0.5, 0.5, 0.5]);
  });

  it('scales to 0..1', () => {
    const candles = [10, 20, 30].map((close, index) => ({
      time: index,
      open: close,
      high: close,
      low: close,
      close,
      volume: 0,
    }));
    expect(normalizeCloses(candles)).toEqual([0, 0.5, 1]);
  });
});
