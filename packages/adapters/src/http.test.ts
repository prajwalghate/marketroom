import { describe, expect, it } from 'vitest';
import { getJson, mapSettledLimit } from './http';

describe('request deadlines', () => {
  it('refuses to start a request after the caller’s deadline has passed', async () => {
    let calls = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls++;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    try {
      const signal = AbortSignal.abort();
      await expect(getJson('https://example.test', { signal })).rejects.toThrow();
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('does not retry once the caller has given up', async () => {
    let calls = 0;
    const controller = new AbortController();
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls++;
      controller.abort();
      return new Response('busy', { status: 503 });
    }) as typeof fetch;
    try {
      await expect(
        getJson('https://example.test', { signal: controller.signal, retries: 3 }),
      ).rejects.toThrow();
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('mapSettledLimit', () => {
  it('keeps input order, settles every item, and never exceeds the limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapSettledLimit([5, 1, 3, 2, 4], 2, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, n));
      inFlight--;
      if (n === 3) throw new Error('three');
      return n * 10;
    });
    expect(peak).toBeLessThanOrEqual(2);
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : 'x'))).toEqual([
      50,
      10,
      'x',
      20,
      40,
    ]);
  });
});
