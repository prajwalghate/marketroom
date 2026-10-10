import { describe, expect, it } from 'vitest';
import { fillsFromBook, type DepthProbe } from './fills';
import { usEquitySession } from './session';
import { MEASURED, routeProbe } from './testing/fixtures';
import {
  assetTrust,
  boardStats,
  listingTrust,
  listingsWithVerdict,
  paperGapSurvival,
  paperGaps,
  realDislocations,
  worstDisplayGaps,
  type TrustContext,
} from './trust';
import type { AssetView, Listing, ListingQuote, Quote, VenueId } from './types';

const NOW = Date.UTC(2026, 9, 5, 22, 58);
const SESSION = usEquitySession(NOW);
const ctx = (reference: TrustContext['reference'] = null): TrustContext => ({
  now: NOW,
  session: SESSION,
  reference,
});

const listing = (id: string, venue: VenueId, assetId = 'asset'): Listing => ({
  id,
  assetId,
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
  controls: null,
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
  observedAt: NOW,
  venueObservedAt: null,
  ...over,
});

const entry = (id: string, venue: VenueId, over: Partial<Quote> = {}): ListingQuote => ({
  listing: listing(id, venue),
  quote: quote({ listingId: id, ...over }),
});

const view = (symbol: string, listings: ListingQuote[]): AssetView =>
  ({ asset: { id: symbol.toLowerCase(), symbol, name: symbol }, listings }) as unknown as AssetView;

/** ASML's perp, shaped like the live book: ~$65k resting within 0.12% of a $1,863.90 mid. */
const asmlPerp: DepthProbe = {
  listingId: 'hyperliquid:xyz:ASML',
  venue: 'hyperliquid',
  displayedPrice: 1863.9,
  fills: fillsFromBook(
    {
      asks: [
        { price: 1864.0, size: 5, count: 1 },
        { price: 1864.5, size: 10, count: 2 },
        { price: 1866.0, size: 20, count: 3 },
      ],
      bids: [
        { price: 1863.8, size: 5, count: 1 },
        { price: 1863.3, size: 10, count: 2 },
        { price: 1862.0, size: 20, count: 3 },
      ],
    },
    1863.9,
    'book',
  ),
  measuredAt: NOW,
  source: 'Hyperliquid order book',
  lastTradeAt: NOW - 752_000,
};

describe('listingTrust — measured verdicts', () => {
  it('rates NVDAx tradable: $10k fills within 0.04% of its mid', () => {
    const t = listingTrust(
      entry('solana:nvdax', 'solana', {
        price: 239.53,
        tradeCount1h: 7874,
        tradeCount24h: 229_149,
      }),
      MEASURED.nvdax,
      ctx({ price: 239.55, source: 'trade[XYZ] oracle' }),
    );
    expect(t.verdict).toBe('tradable');
    expect(t.headline).toBe('A $10,000 order fills within 0.04% of the market price.');
    expect(t.withinOnePercent).toEqual({ kind: 'at-least', usd: 100_000 });
    expect(t.checks.map((c) => [c.id, c.status])).toEqual([
      ['depth', 'pass'],
      ['price', 'pass'],
      ['reference', 'pass'],
      ['activity', 'pass'],
    ]);
  });

  it('rates ASMLx quote-only and says what a $1,000 buy really costs', () => {
    const t = listingTrust(
      entry('solana:asmlx', 'solana', { price: 2000.65, liquidity: 111 }),
      MEASURED.asmlx,
      ctx(),
    );
    expect(t.verdict).toBe('quote-only');
    expect(t.headline).toBe('Shows $2,000.65, but a $1,000 buy fills at $6,434.40 (+222%).');
    expect(t.short).toBe('$1k buy +222%');
    expect(t.withinOnePercent).toEqual({ kind: 'below', usd: 100 });
    const price = t.checks.find((c) => c.id === 'price')!;
    expect(price.status).toBe('fail');
    expect(price.finding).toBe(
      'There is no stable price: $100 buys and sells already land 62.1% apart.',
    );
  });

  it('treats missing trade stats on a pool-backed token as no trades', () => {
    const t = listingTrust(
      entry('solana:asmlx', 'solana', { price: 2000.65 }),
      MEASURED.asmlx,
      ctx(),
    );
    expect(t.checks.find((c) => c.id === 'activity')!.status).toBe('fail');
  });

  it('rates CRWVx no-market: a price with no route behind it', () => {
    const t = listingTrust(
      entry('solana:crwvx', 'solana', { price: 85.51 }),
      MEASURED.crwvx,
      ctx(),
    );
    expect(t.verdict).toBe('no-market');
    expect(t.headline).toBe('Shows $85.51, but there is no route to trade it at any size.');
  });

  it('rates a market thin when small tickets hold but $10k does not', () => {
    const probe = routeProbe('solana:thin', 100, {
      100: [100.05, 99.95],
      1000: [100.5, 99.5],
      10000: [103, 97],
    });
    const t = listingTrust(entry('solana:thin', 'solana', { price: 100 }), probe, ctx());
    expect(t.verdict).toBe('thin');
    expect(t.headline).toBe('Fine for small trades — a $10,000 order moves the price 3.00%.');
  });

  it('flags a deep market whose displayed price has drifted, without condemning the market', () => {
    const probe = {
      ...routeProbe('solana:drift', 103, {
        100: [100.01, 99.99],
        1000: [100.02, 99.98],
        10000: [100.1, 99.9],
      }),
    };
    const t = listingTrust(entry('solana:drift', 'solana', { price: 103 }), probe, ctx());
    expect(t.verdict).toBe('tradable');
    const price = t.checks.find((c) => c.id === 'price')!;
    expect(price.status).toBe('fail');
    expect(price.finding).toBe('The shown price is 3.00% above where it actually trades.');
  });

  it('flags an executable price far from the underlying, and says why off-hours', () => {
    const t = listingTrust(
      entry('solana:nvdax', 'solana', { price: 239.53, tradeCount1h: 1 }),
      MEASURED.nvdax,
      ctx({ price: 230, source: 'trade[XYZ] oracle' }),
    );
    const reference = t.checks.find((c) => c.id === 'reference')!;
    expect(reference.status).toBe('fail');
    expect(reference.finding).toContain('above the trade[XYZ] oracle');
    expect(reference.finding).toContain('outside regular US hours');
  });

  it('will not check a perp against its own weekend oracle', () => {
    const saturday = Date.UTC(2026, 9, 10, 16, 0);
    const t = listingTrust(
      entry('hyperliquid:xyz:ASML', 'hyperliquid', { price: 1863.9 }),
      asmlPerp,
      {
        now: saturday,
        session: usEquitySession(saturday),
        reference: { price: 1863.9, source: 'trade[XYZ] oracle' },
      },
    );
    const reference = t.checks.find((c) => c.id === 'reference')!;
    expect(reference.status).toBe('unknown');
    expect(reference.finding).toContain('No stock price exists until Sun 8:00 PM ET');
  });

  it('reads a perp’s activity from its last trade', () => {
    const t = listingTrust(
      entry('hyperliquid:xyz:ASML', 'hyperliquid', { price: 1863.9 }),
      asmlPerp,
      ctx(),
    );
    expect(t.verdict).toBe('tradable');
    const activity = t.checks.find((c) => c.id === 'activity')!;
    expect(activity.status).toBe('pass');
    expect(activity.finding).toBe('Last trade 13m ago.');
  });
});

describe('listingTrust — without a measurement', () => {
  it('still condemns a listing the liquidity floor rules out — and says why, not "no route"', () => {
    const t = listingTrust(
      entry('solana:dead', 'solana', { price: 50, liquidity: 107 }),
      null,
      ctx(),
    );
    expect(t.verdict).toBe('no-market');
    expect(t.headline).toBe(
      'Shows $50.00, but pool holds $107 — too little to trade against at any size.',
    );
  });

  it('says "not measured" rather than guessing for a healthy-looking listing', () => {
    const t = listingTrust(
      entry('solana:ok', 'solana', { price: 50, liquidity: 5_000_000 }),
      null,
      ctx(),
    );
    expect(t.verdict).toBe('unmeasured');
    expect(t.checks.every((c) => c.id === 'activity' || c.status === 'unknown')).toBe(true);
  });

  it('does not read a failed measurement as an empty market', () => {
    const probe: DepthProbe = {
      ...MEASURED.crwvx,
      fills: MEASURED.crwvx.fills.map((f) => ({ ...f, failure: 'error' as const })),
    };
    const t = listingTrust(
      entry('solana:x', 'solana', { price: 85.51, liquidity: 2_000_000 }),
      probe,
      ctx(),
    );
    expect(t.verdict).toBe('unmeasured');
  });
});

describe('cross-venue', () => {
  const asml = view('ASML', [
    entry('hyperliquid:xyz:ASML', 'hyperliquid', { price: 1863.9, oraclePrice: 1861.7 }),
    entry('solana:asmlx', 'solana', { price: 2000.65, liquidity: 111 }),
  ]);
  const crwv = view('CRWV', [entry('solana:crwvx', 'solana', { price: 85.51 })]);
  const probes = {
    'hyperliquid:xyz:ASML': asmlPerp,
    'solana:asmlx': MEASURED.asmlx,
    'solana:crwvx': MEASURED.crwvx,
  };
  const base = { now: NOW, session: SESSION };

  it('prices the paper gap as the trade it suggests — and it loses 80%', () => {
    const t = assetTrust(asml, probes, base);
    expect(t.best).toBe('tradable');
    expect(t.realGap!.paper).toBeCloseTo(0.0734, 3);
    expect(t.realGap!.buy.venue).toBe('hyperliquid');
    expect(t.realGap!.sell.venue).toBe('solana');
    expect(t.realGap!.executable).toBeCloseTo(368.28 / 1864.0254 - 1, 3);
  });

  it('uses the perp oracle as the reference, and names it', () => {
    const t = assetTrust(asml, probes, base);
    const perp = t.listings.find((l) => l.venue === 'hyperliquid')!;
    const reference = perp.checks.find((c) => c.id === 'reference')!;
    expect(reference.source).toBe('trade[XYZ] oracle');
    expect(reference.status).toBe('pass');
  });

  it('ranks measured gaps on the reality board and lists dead listings apart', () => {
    const assets = [assetTrust(asml, probes, base), assetTrust(crwv, probes, base)];
    expect(worstDisplayGaps(assets).map((e) => e.asset.view.asset.symbol)).toEqual(['ASML']);
    expect(listingsWithVerdict(assets, 'no-market').map((e) => e.asset.view.asset.symbol)).toEqual([
      'CRWV',
    ]);
  });

  it('counts headline gaps and how many survive execution', () => {
    const assets = [assetTrust(asml, probes, base), assetTrust(crwv, probes, base)];
    expect(paperGapSurvival(assets)).toEqual({ headlined: 1, survive: 0 });
    expect(realDislocations(assets)).toHaveLength(1);
  });

  it('ranks gaps the way a price screen would, carrying what each really returns', () => {
    const [first] = paperGaps([assetTrust(asml, probes, base), assetTrust(crwv, probes, base)]);
    expect(first!.asset.view.asset.symbol).toBe('ASML');
    expect(first!.gap.executable).toBeLessThan(-0.75);
  });

  it('tallies the board by verdict', () => {
    const stats = boardStats([assetTrust(asml, probes, base), assetTrust(crwv, probes, base)]);
    expect(stats.listings).toBe(3);
    expect(stats.byVerdict).toMatchObject({ tradable: 1, 'quote-only': 1, 'no-market': 1 });
    expect(stats.byVenue.solana).toMatchObject({ 'quote-only': 1, 'no-market': 1 });
    expect(stats.oldestMeasurement).toBe(NOW);
  });
});
