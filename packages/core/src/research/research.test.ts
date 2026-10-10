import { describe, expect, it } from 'vitest';
import {
  activityLevel,
  canonicalUrl,
  classifySource,
  duplicatePairs,
  estimateActivity,
  findMentions,
  freshness,
  guessParty,
  looseKey,
  normalizeName,
  normalizeRoundType,
  roundStage,
  toSlug,
  uniqueSlug,
} from './index';

describe('names', () => {
  it('normalises case, accents, punctuation and legal suffixes only', () => {
    expect(normalizeName('Multicoin Capital, LLC')).toBe('multicoin capital');
    expect(normalizeName('Café  Ventures Inc.')).toBe('cafe ventures');
    expect(normalizeName('A&T Labs')).toBe('a and t labs');
    // Different firms stay different.
    expect(normalizeName('Jump Capital')).not.toBe(normalizeName('Jump Crypto'));
  });

  it('loosens names for duplicate suggestions', () => {
    expect(looseKey('Multicoin Capital')).toBe('multicoin');
    expect(looseKey('Multicoin')).toBe('multicoin');
    // A name made only of generic words keeps them rather than vanishing.
    expect(looseKey('Capital Partners')).toBe('capital partners');
  });

  it('slugs, and finds a free one', () => {
    expect(toSlug('Série A — Kamino!')).toBe('serie-a-kamino');
    const taken = new Set(['drift', 'drift-2']);
    expect(uniqueSlug('Drift', (s) => taken.has(s))).toBe('drift-3');
  });

  it('guesses whether an investor name is a person', () => {
    expect(guessParty('Anatoly Yakovenko')).toBe('person');
    expect(guessParty('Sam Bankman-Fried')).toBe('person');
    expect(guessParty('Raj Gokal')).toBe('person');
    expect(guessParty('Multicoin Capital')).toBe('organization');
    // Firms seen filed as angels before the word list grew.
    for (const firm of [
      'Double Peak',
      'Chapter One',
      'Geek Cartel',
      'Not Boring',
      'Project Serum',
      'Ledger Prime',
      'Draper Dragon',
      'Wemade Tree',
      'Crucible Captial',
      'Emirates Consortium',
      'Avalon Wealth Club',
    ])
      expect(guessParty(firm)).toBe('organization');
    expect(guessParty('Andreessen Horowitz')).toBe('organization');
    expect(guessParty('Jane Street')).toBe('organization');
    expect(guessParty('Animoca Brands')).toBe('organization');
    expect(guessParty('Coinbase')).toBe('organization');
    expect(guessParty('a16z crypto')).toBe('organization');
    expect(guessParty('Crypto.com')).toBe('organization');
    expect(guessParty('GSR')).toBe('organization');
    // Firms that read like names, from real Solana rounds.
    for (const firm of [
      'Draper Associates',
      'Draper Dragon',
      'Samsung Next',
      'Ark Invest',
      'Avalon Wealth Club',
      'Chapter One',
      'Crucible Captial',
      'Emirates Consortium',
      'Forward Industries',
      'Geek Cartel',
      'Joint Effects',
      'Ledger Prime',
      'Not Boring',
      'Project Serum',
      'Smile Asia',
      'Wemade Tree',
    ]) {
      expect(guessParty(firm), firm).toBe('organization');
    }
    for (const person of [
      'Mike Novogratz',
      'Lily Liu',
      'Santiago Roel Santos',
      'Miyuki Matsumoto',
      'Sreeram Kannan',
    ]) {
      expect(guessParty(person), person).toBe('person');
    }
  });
});

describe('rounds', () => {
  it('maps every spelling onto one vocabulary', () => {
    expect(normalizeRoundType('seed')).toBe('Seed');
    expect(normalizeRoundType('Seed Round')).toBe('Seed');
    expect(normalizeRoundType('Pre Seed')).toBe('Pre-seed');
    expect(normalizeRoundType('series-a')).toBe('Series A');
    expect(normalizeRoundType('Series E')).toBe('Series D+');
    expect(normalizeRoundType('Strategic round')).toBe('Strategic');
    expect(normalizeRoundType('ICO')).toBe('Public sale');
    expect(normalizeRoundType('Ecosystem grant')).toBe('Grant');
  });

  it('treats meaningless types as not stated, and keeps unknown ones as printed', () => {
    expect(normalizeRoundType('Undisclosed')).toBeNull();
    expect(normalizeRoundType('')).toBeNull();
    expect(normalizeRoundType(null)).toBeNull();
    expect(normalizeRoundType('bridge')).toBe('Bridge');
  });

  it('orders stages', () => {
    expect(roundStage('Seed')).toBeLessThan(roundStage('Series A'));
    expect(roundStage('Bridge')).toBeGreaterThan(roundStage('Debt'));
  });
});

describe('sources', () => {
  it('classifies links by who published them', () => {
    expect(classifySource('https://www.theblock.co/post/123/drift-raises')).toEqual({
      kind: 'press',
      publisher: 'The Block',
    });
    expect(classifySource('https://x.com/DriftProtocol/status/1').kind).toBe('social');
    expect(classifySource('https://medium.com/@drift/seed').kind).toBe('announcement');
    expect(classifySource('https://blog.kamino.finance/raise').kind).toBe('announcement');
    expect(classifySource('https://defillama.com/raises').kind).toBe('database');
    expect(classifySource('https://solscan.io/account/abc').kind).toBe('onchain');
    expect(classifySource('https://www.sec.gov/Archives/x').kind).toBe('filing');
    expect(classifySource('https://github.com/jup-ag').kind).toBe('repository');
    expect(classifySource('not a url')).toEqual({ kind: 'website', publisher: null });
  });

  it('canonicalises links for de-duplication', () => {
    expect(canonicalUrl('https://twitter.com/drift/status/1?s=20&utm_source=x#top')).toBe(
      'https://x.com/drift/status/1',
    );
    expect(canonicalUrl('https://Example.com/post/?ref=abc')).toBe('https://example.com/post');
    expect(canonicalUrl('https://example.com/?id=7')).toBe('https://example.com/?id=7');
  });
});

describe('activity', () => {
  const now = Date.UTC(2026, 9, 10, 12, 0, 0);
  const at = (secondsAgo: number) => now / 1000 - secondsAgo;

  it('estimates a rate from the oldest signature to now', () => {
    // 100 transactions over the last hour.
    const samples = Array.from({ length: 100 }, (_, i) => ({
      blockTime: at(i * 36 + 36),
      failed: i % 10 === 0,
    }));
    const est = estimateActivity(samples, now);
    expect(est.sampleSize).toBe(100);
    expect(est.txPerHour).toBeCloseTo(100, 0);
    expect(est.failedShare).toBeCloseTo(0.1);
    expect(est.latestTxAt).toBe((now / 1000 - 36) * 1000);
  });

  it('does not read a program that went quiet as busy', () => {
    // A burst of 50 transactions, a week ago.
    const week = 7 * 86_400;
    const samples = Array.from({ length: 50 }, (_, i) => ({
      blockTime: at(week + i),
      failed: false,
    }));
    const est = estimateActivity(samples, now);
    expect(est.txPerHour).toBeLessThan(1);
  });

  it('reports nothing it cannot measure', () => {
    expect(estimateActivity([], now)).toEqual({
      sampleSize: 0,
      windowSeconds: null,
      txPerHour: null,
      failedShare: null,
      latestTxAt: null,
    });
    expect(estimateActivity([{ blockTime: null, failed: false }], now).txPerHour).toBeNull();
  });

  it('measures a complete sample from where the node’s history starts, not its oldest signature', () => {
    // The node keeps a day of history and holds three transactions, two of
    // them in the last hour. Without `completeSince` that reads as ~1.5/hour.
    const dayAgo = now - 86_400_000;
    const samples = [at(600), at(1_800), at(20 * 3_600)].map((blockTime) => ({
      blockTime,
      failed: false,
    }));
    const naive = estimateActivity(samples, now);
    expect(naive.txPerHour).toBeCloseTo(3 / 20, 3);
    const est = estimateActivity(samples, now, { completeSince: dayAgo });
    expect(est.windowSeconds).toBe(86_400);
    expect(est.txPerHour).toBeCloseTo(3 / 24, 6);
    expect(est.latestTxAt).toBe(at(600) * 1000);
  });

  it('reads an empty complete sample as a measured zero', () => {
    const est = estimateActivity([], now, { completeSince: now - 3_600_000 });
    expect(est).toEqual({
      sampleSize: 0,
      windowSeconds: 3_600,
      txPerHour: 0,
      failedShare: null,
      latestTxAt: null,
    });
  });

  it('counts undated signatures in a complete sample, and never starts after its own oldest one', () => {
    const since = now - 7_200_000;
    const est = estimateActivity(
      [
        { blockTime: null, failed: true },
        { blockTime: at(3 * 3_600), failed: false },
      ],
      now,
      { completeSince: since },
    );
    // The dated signature is older than `since`: the window stretches to it.
    expect(est.windowSeconds).toBe(3 * 3_600);
    expect(est.txPerHour).toBeCloseTo(2 / 3, 6);
    expect(est.failedShare).toBe(0.5);
  });

  it('ignores a completeSince that is not a number', () => {
    const samples = [{ blockTime: at(3_600), failed: false }];
    expect(estimateActivity(samples, now, { completeSince: null })).toEqual(
      estimateActivity(samples, now),
    );
    expect(estimateActivity(samples, now, { completeSince: Number.NaN })).toEqual(
      estimateActivity(samples, now),
    );
  });

  it('levels activity coarsely', () => {
    expect(activityLevel(5_000, now, now)).toBe('high');
    expect(activityLevel(100, now, now)).toBe('moderate');
    expect(activityLevel(2, now, now)).toBe('low');
    expect(activityLevel(2, now - 40 * 86_400_000, now)).toBe('dormant');
    expect(activityLevel(null, null, now)).toBe('unknown');
  });
});

describe('mentions', () => {
  const candidates = [
    { id: 1, names: ['Drift'] },
    { id: 2, names: ['Magic Eden'] },
    { id: 3, names: ['Kamino', 'Kamino Finance'] },
    { id: 4, names: ['Solana'] },
  ];

  it('matches names on word boundaries', () => {
    const found = findMentions(
      { title: "Magic Eden's new launchpad", summary: 'Also: kamino finance vaults' },
      candidates,
    );
    expect(found).toEqual([
      { id: 2, matchedBy: 'title' },
      { id: 3, matchedBy: 'summary' },
    ]);
  });

  it('only counts an ordinary word in a Solana story, written as a name', () => {
    expect(findMentions({ title: 'Continental drift explained' }, candidates)).toEqual([]);
    expect(findMentions({ title: 'Drift raises on Solana' }, candidates)).toEqual([
      { id: 1, matchedBy: 'title' },
    ]);
    expect(findMentions({ title: 'Markets drift lower on Solana news' }, candidates)).toEqual([]);
  });

  it('never matches the chain itself', () => {
    expect(findMentions({ title: 'Solana hits a record' }, candidates)).toEqual([]);
  });
});

describe('duplicates', () => {
  it('pairs records by name, website and X account, with the reasons', () => {
    const pairs = duplicatePairs([
      { id: 1, name: 'Multicoin Capital', website: 'https://multicoin.capital' },
      { id: 2, name: 'Multicoin', website: 'multicoin.capital' },
      { id: 3, name: 'Jump Crypto', twitter: '@jump_' },
      { id: 4, name: 'Jump Capital', twitter: 'https://x.com/jump_' },
      { id: 5, name: 'Other', website: 'https://x.com/other' },
      { id: 6, name: 'Another', website: 'https://x.com/another' },
    ]);
    expect(pairs).toContainEqual({ a: 1, b: 2, reasons: ['similar name', 'same website'] });
    expect(pairs).toContainEqual({ a: 3, b: 4, reasons: ['similar name', 'same X account'] });
    // A shared host like x.com proves nothing.
    expect(pairs.find((p) => p.a === 5 && p.b === 6)).toBeUndefined();
  });

  it('never proposes a pair an editor dismissed', () => {
    const pairs = duplicatePairs(
      [
        { id: 1, name: 'Drift' },
        { id: 2, name: 'Drift' },
      ],
      new Set(['1:2']),
    );
    expect(pairs).toEqual([]);
  });
});

describe('freshness', () => {
  const now = Date.UTC(2026, 9, 10);
  it('ages a profile by when a person last checked it', () => {
    expect(freshness(null, now)).toBe('never');
    expect(freshness(now - 5 * 86_400_000, now)).toBe('fresh');
    expect(freshness(now - 45 * 86_400_000, now)).toBe('aging');
    expect(freshness(now - 120 * 86_400_000, now)).toBe('stale');
  });
});
