import { describe, expect, it } from 'vitest';
import { isoDateParameters } from './client';

describe('postgres.js parameters', () => {
  it('sends dates as ISO 8601 and leaves strings alone', () => {
    // Drizzle installs pass-through serializers; ours replace them.
    const serializers: Record<number, (value: unknown) => unknown> = { 1184: (v) => v };
    isoDateParameters(serializers);
    const date = new Date('2024-07-15T08:02:46Z');
    expect(serializers[1184]!(date)).toBe('2024-07-15T08:02:46.000Z');
    expect(serializers[1114]!(date)).toBe('2024-07-15T08:02:46.000Z');
    expect(serializers[1184]!('2024-07-15 08:02:46+00')).toBe('2024-07-15 08:02:46+00');
  });
});
