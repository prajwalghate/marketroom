import { describe, expect, it } from 'vitest';
import { feeFraction } from './staking';

describe('Solana Compass fee pairs', () => {
  it('reads a numerator/denominator pair as a fraction', () => {
    expect(feeFraction({ numerator: 4, denominator: 100 })).toBe(0.04);
    expect(feeFraction({ numerator: 1, denominator: 1000 })).toBe(0.001);
    expect(feeFraction({ numerator: 10000, denominator: 100000 })).toBe(0.1);
  });

  it('treats 0/0 as no fee, and a missing pair as unknown', () => {
    expect(feeFraction({ numerator: 0, denominator: 0 })).toBe(0);
    expect(feeFraction(null)).toBeNull();
    expect(feeFraction({ numerator: 5, denominator: 0 })).toBeNull();
  });
});
