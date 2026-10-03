import { describe, expect, it } from 'vitest';
import {
  bestContrastExample,
  marketTotals,
  topDislocations,
  topGainers,
  topLosers,
  topByVolume,
} from './insights';
import type { Asset, AssetView, Listing, Quote } from './types';

const asset = (id: string): Asset => ({
  id,
  symbol: id.toUpperCase(),
  name: id,
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Semiconductors' },
  country: 'US',
  summary: '',
  peers: [],
  isPrivate: false,
  peRatio: null,
});

const listing = (id: string, kind: Listing['kind'] = 'perpetual'): Listing => ({
  id,
  assetId: 'x',
  venue: kind === 'perpetual' ? 'hyperliquid' : 'solana',
  venueSymbol: id,
  kind,
  maxLeverage: kind === 'perpetual' ? 20 : 1,
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
  volume24h: 1000,
  openInterest: null,
  liquidity: null,
  fundingRate: null,
  oraclePrice: null,
  fdv: null,
  holders: null,
  observedAt: 0,
  ...over,
});

const view = (id: string, listings: AssetView['listings']): AssetView => ({
  asset: asset(id),
  listings,
});

const single = (id: string, q: Partial<Quote>): AssetView =>
  view(id, [{ listing: listing(id), quote: quote(q) }]);

describe('movers', () => {
  const universe = [
    single('up1', { price: 110, prevDayPrice: 100 }),
    single('up2', { price: 105, prevDayPrice: 100 }),
    single('down1', { price: 90, prevDayPrice: 100 }),
    single('flat', { price: 100, prevDayPrice: 100 }),
  ];

  it('ranks gainers by size of move', () => {
    expect(topGainers(universe).map((m) => m.view.asset.id)).toEqual(['up1', 'up2']);
  });

  it('never lets a loser into the gainers list', () => {
    expect(topGainers(universe).every((m) => m.change > 0)).toBe(true);
    expect(topLosers(universe).map((m) => m.view.asset.id)).toEqual(['down1']);
  });

  it('returns an empty list on a one-sided day rather than padding it', () => {
    const allDown = [single('a', { price: 90, prevDayPrice: 100 })];
    expect(topGainers(allDown)).toEqual([]);
  });

  it('excludes assets with no reference price', () => {
    expect(topGainers([single('x', { prevDayPrice: null })])).toEqual([]);
  });
});

describe('topDislocations', () => {
  it('ranks by spread and ignores single-venue assets', () => {
    const universe = [
      view('wide', [
        { listing: listing('a'), quote: quote({ price: 100 }) },
        { listing: listing('b', 'tokenized-equity'), quote: quote({ price: 103 }) },
      ]),
      view('narrow', [
        { listing: listing('c'), quote: quote({ price: 100 }) },
        { listing: listing('d', 'tokenized-equity'), quote: quote({ price: 100.5 }) },
      ]),
      single('solo', { price: 100 }),
    ];
    expect(topDislocations(universe).map((d) => d.view.asset.id)).toEqual(['wide', 'narrow']);
  });
});

describe('topByVolume', () => {
  it('excludes assets with no volume rather than ranking them as zero', () => {
    const universe = [
      single('a', { volume24h: 500 }),
      single('b', { volume24h: null }),
      single('c', { volume24h: 900 }),
    ];
    expect(topByVolume(universe).map((v) => v.view.asset.id)).toEqual(['c', 'a']);
  });
});

describe('bestContrastExample', () => {
  it('picks the most liquid asset whose venues are genuinely different products', () => {
    const universe = [
      view('quiet', [
        { listing: listing('a'), quote: quote({ volume24h: 10 }) },
        { listing: listing('b', 'tokenized-equity'), quote: quote({ volume24h: 10 }) },
      ]),
      view('busy', [
        { listing: listing('c'), quote: quote({ volume24h: 9000 }) },
        { listing: listing('d', 'tokenized-equity'), quote: quote({ volume24h: 9000 }) },
      ]),
    ];
    expect(bestContrastExample(universe)?.asset.id).toBe('busy');
  });

  it('rejects a pair that differs only in price, not in instrument', () => {
    const sameKind = view('same', [
      { listing: listing('a'), quote: quote() },
      { listing: listing('b'), quote: quote() },
    ]);
    expect(bestContrastExample([sameKind])).toBeNull();
  });

  it('rejects a pair where one side is unquoted, which would render half-empty', () => {
    const halfQuoted = view('half', [
      { listing: listing('a'), quote: quote() },
      { listing: listing('b', 'tokenized-equity'), quote: null },
    ]);
    expect(bestContrastExample([halfQuoted])).toBeNull();
  });

  it('returns null when nothing is dual-listed', () => {
    expect(bestContrastExample([single('a', {})])).toBeNull();
  });
});

describe('marketTotals', () => {
  it('counts multi-venue assets and sums volume', () => {
    const universe = [
      single('a', { volume24h: 100 }),
      view('b', [
        { listing: listing('c'), quote: quote({ volume24h: 200 }) },
        { listing: listing('d', 'tokenized-equity'), quote: quote({ volume24h: 300 }) },
      ]),
    ];
    const t = marketTotals(universe);
    expect(t.assetCount).toBe(2);
    expect(t.multiVenueCount).toBe(1);
    expect(t.volume24hUsd).toBe(600);
  });
});
