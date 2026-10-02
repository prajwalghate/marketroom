import { describe, expect, it } from 'vitest';
import { compareExposure, venueCost, type VenueCostInputs } from './costOfExposure';

/**
 * The crossover is the headline number this feature exists to produce, so the
 * tests concentrate on it — and on refusing to answer when an input is missing,
 * which is the failure that would mislead rather than merely disappoint.
 */

const perp = (over: Partial<VenueCostInputs> = {}): VenueCostInputs => ({
  listingId: 'hyperliquid:xyz:NVDA',
  venue: 'hyperliquid',
  kind: 'perpetual',
  roundTripFraction: 0.001, // 10 bps round trip
  fundingRatePerHour: 0.00001, // 0.001%/h ≈ 0.024%/day
  maxLeverage: 20,
  ...over,
});

const token = (over: Partial<VenueCostInputs> = {}): VenueCostInputs => ({
  listingId: 'solana:Xsc9',
  venue: 'solana',
  kind: 'tokenized-equity',
  roundTripFraction: 0.004, // 40 bps round trip
  fundingRatePerHour: null, // spot has no carry
  maxLeverage: 1,
  ...over,
});

describe('venueCost', () => {
  it('charges a token its swap cost and no carry', () => {
    const c = venueCost(token(), { notionalUsd: 10_000, days: 30 });
    expect(c.components).toHaveLength(1);
    expect(c.totalFraction).toBeCloseTo(0.004);
    expect(c.totalUsd).toBeCloseTo(40);
  });

  it('charges a perp funding that grows with the holding period', () => {
    const short = venueCost(perp(), { notionalUsd: 10_000, days: 1 });
    const long = venueCost(perp(), { notionalUsd: 10_000, days: 30 });
    expect(long.totalFraction).toBeGreaterThan(short.totalFraction);
    // 0.00001/h * 24 * 30 = 0.0072, plus 0.001 round trip.
    expect(long.totalFraction).toBeCloseTo(0.0082);
  });

  it('treats negative funding as income, not cost', () => {
    const c = venueCost(perp({ fundingRatePerHour: -0.00002 }), {
      notionalUsd: 10_000,
      days: 30,
    });
    expect(c.components.some((x) => x.label === 'Funding received')).toBe(true);
    expect(c.totalFraction).toBeLessThan(0);
  });

  it('reflects leverage in capital required, not in cost', () => {
    const c = venueCost(perp(), { notionalUsd: 10_000, days: 1 });
    expect(c.capitalRequiredUsd).toBe(500); // 10k at 20x
    expect(venueCost(token(), { notionalUsd: 10_000, days: 1 }).capitalRequiredUsd).toBe(10_000);
  });

  it('marks itself incomplete rather than assuming execution is free', () => {
    const c = venueCost(perp({ roundTripFraction: null }), { notionalUsd: 10_000, days: 1 });
    expect(c.complete).toBe(false);
    expect(c.components.every((x) => x.recurring)).toBe(true);
  });
});

describe('compareExposure', () => {
  const params = { notionalUsd: 10_000, days: 30 };

  it('finds the crossover between a cheap-to-enter perp and a flat token', () => {
    const r = compareExposure([perp(), token()], params);
    // perp: 0.001 + 0.00024/day ; token: 0.004 flat
    // crossover at (0.004 - 0.001) / 0.00024 = 12.5 days
    expect(r.crossoverDays).toBeCloseTo(12.5, 1);
    expect(r.cheaperBefore?.venue).toBe('hyperliquid');
    expect(r.cheaperAfter?.venue).toBe('solana');
  });

  it('picks the cheapest at the requested horizon', () => {
    expect(compareExposure([perp(), token()], { ...params, days: 5 }).cheapest?.venue).toBe(
      'hyperliquid',
    );
    expect(compareExposure([perp(), token()], { ...params, days: 60 }).cheapest?.venue).toBe(
      'solana',
    );
  });

  it('reports no crossover when funding makes the perp cheaper forever', () => {
    const r = compareExposure([perp({ fundingRatePerHour: -0.00001 }), token()], params);
    expect(r.crossoverDays).toBeNull();
  });

  it('reports no crossover beyond a sensible horizon', () => {
    // Funding so small the lines meet in ~34 years.
    const r = compareExposure([perp({ fundingRatePerHour: 1e-9 }), token()], params);
    expect(r.crossoverDays).toBeNull();
  });

  it('refuses a crossover when the venues have the same cost shape', () => {
    const r = compareExposure([token(), token({ listingId: 'solana:other' })], params);
    expect(r.crossoverDays).toBeNull();
  });

  it('excludes incomplete venues from the comparison', () => {
    const r = compareExposure([perp({ roundTripFraction: null }), token()], params);
    expect(r.cheapest?.venue).toBe('solana');
    expect(r.crossoverDays).toBeNull();
  });

  it('returns no cheapest when nothing is measurable', () => {
    const r = compareExposure([perp({ roundTripFraction: null })], params);
    expect(r.cheapest).toBeNull();
  });
});
