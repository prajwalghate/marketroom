import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildLabelIndex,
  labelKey,
  matchLabel,
  otterSecStatusPage,
  parseRepoUrl,
  parseSwapLabels,
  parseUtc,
  parseVerifiedPrograms,
  prettyRepoName,
} from './programs';

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8')) as unknown;

describe('repository links', () => {
  it('splits a GitHub link pinned to a commit', () => {
    expect(
      parseRepoUrl(
        'https://github.com/Metafide/mf-solana-gateway-deposit/tree/215c57970a3d2e0d58bfb9992b4306c4d0af5127',
      ),
    ).toEqual({
      host: 'github.com',
      owner: 'Metafide',
      name: 'mf-solana-gateway-deposit',
      url: 'https://github.com/Metafide/mf-solana-gateway-deposit',
      ref: '215c57970a3d2e0d58bfb9992b4306c4d0af5127',
    });
  });

  it('accepts a bare repository, a .git suffix, a trailing slash and www', () => {
    expect(parseRepoUrl('https://github.com/Woody4618/verify-2-1')).toMatchObject({
      owner: 'Woody4618',
      name: 'verify-2-1',
      ref: null,
    });
    expect(parseRepoUrl('https://www.github.com/a/b.git/')).toMatchObject({
      host: 'github.com',
      url: 'https://github.com/a/b',
    });
  });

  it('handles GitLab and self-hosted forges, nested groups included', () => {
    expect(
      parseRepoUrl('https://gitlab.com/sorare/solana-public-programs-bank/tree/a8c6b73a'),
    ).toMatchObject({
      host: 'gitlab.com',
      owner: 'sorare',
      url: 'https://gitlab.com/sorare/solana-public-programs-bank',
      ref: 'a8c6b73a',
    });
    expect(parseRepoUrl('https://gitlab.com/group/sub/repo/-/tree/v1.2')).toMatchObject({
      owner: 'group',
      name: 'repo',
      url: 'https://gitlab.com/group/sub/repo',
      ref: 'v1.2',
    });
  });

  it('rejects what is not a repository', () => {
    expect(parseRepoUrl('')).toBeNull();
    expect(parseRepoUrl(null)).toBeNull();
    expect(parseRepoUrl('https://github.com/only-owner')).toBeNull();
    expect(parseRepoUrl('ftp://github.com/a/b')).toBeNull();
    expect(parseRepoUrl('not a url')).toBeNull();
  });

  it('names a program after its repository', () => {
    expect(prettyRepoName('protocol-v2')).toBe('Protocol V2');
    expect(prettyRepoName('clmm_program')).toBe('CLMM Program');
    expect(prettyRepoName('kfarms')).toBe('Kfarms');
  });
});

describe('OtterSec registry', () => {
  const programs = parseVerifiedPrograms(fixture('ottersec.json'));
  const byAddress = new Map(programs.map((p) => [p.address, p]));

  it('keeps verified programs with valid addresses only', () => {
    expect(programs).toHaveLength(7);
    expect(byAddress.has('not-a-program')).toBe(false);
    // Listed, but not verified.
    expect(byAddress.has('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin')).toBe(false);
  });

  it('reads OtterSec’s zone-less timestamps as UTC', () => {
    expect(byAddress.get('12qG65pCn4RdtNbG6MyqS5yFjQo5qvabMAj2jLtbZN14')?.verifiedAt).toBe(
      Date.UTC(2026, 4, 4, 17, 26, 6, 696),
    );
    expect(parseUtc('2026-05-04T17:26:06+02:00')).toBe(Date.UTC(2026, 4, 4, 15, 26, 6));
    expect(parseUtc('')).toBeNull();
  });

  it('takes the commit OtterSec reports, else the ref in the link, else none', () => {
    expect(byAddress.get('4X79YRjz9KNMhdjdxXg2ZNTS3YnMGYdwJkBHnezMJwr3')?.commit).toBe('6f34d5b');
    expect(byAddress.get('12wpf4YZ2z3rLqyBP1dKkXQuNuz8i1bt4LWEPWuiABXN')?.commit).toBeNull();
    expect(byAddress.get('FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr')?.repo).toMatchObject({
      owner: 'Kamino-Finance',
      url: 'https://github.com/Kamino-Finance/kfarms',
    });
  });

  it('cites each program’s public status page', () => {
    expect(otterSecStatusPage('FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr')).toBe(
      'https://verify.osec.io/status/FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr',
    );
  });

  it('refuses a response it does not recognise', () => {
    expect(() => parseVerifiedPrograms({ status: 'error' })).toThrow();
  });
});

describe('Jupiter labels', () => {
  const labels = parseSwapLabels(fixture('jupiter-labels.json'));

  it('keeps labelled programs with valid addresses', () => {
    expect(labels.some((l) => l.label === 'Bogus')).toBe(false);
    expect(labels.find((l) => l.label === 'Raydium CLMM')?.address).toBe(
      'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
    );
  });

  it('strips product words and versions from the end only', () => {
    expect(labelKey('Raydium CLMM')).toBe('raydium');
    expect(labelKey('Meteora DAMM v2')).toBe('meteora');
    expect(labelKey('Pump.fun Amm')).toBe('pump fun');
    expect(labelKey('Saber (Decimals)')).toBe('saber decimals');
    expect(labelKey('Stableswap')).toBe('');
    expect(labelKey('Swap Station Labs')).toBe('swap station labs');
  });

  const index = buildLabelIndex([
    { id: 1, names: ['Raydium', 'raydium'] },
    { id: 2, names: ['Meteora'] },
    { id: 3, names: ['Pump'] },
    { id: 4, names: ['Saber'] },
    { id: 5, names: ['Sanctum'] },
    { id: 6, names: ['Crema Finance'] },
    { id: 7, names: ['Perena'] },
    { id: 8, names: ['boop.fun'] },
    { id: 9, names: ['Orca DEX'] },
    // Two projects that answer to the same name: neither may be guessed.
    { id: 10, names: ['Twin'] },
    { id: 11, names: ['Twin'] },
  ]);

  it('matches a label to the project whose name it starts with', () => {
    const match = (label: string) => matchLabel(label, index)?.id ?? null;
    expect(match('Raydium CLMM')).toBe(1);
    expect(match('Raydium CP')).toBe(1);
    expect(match('Meteora DLMM')).toBe(2);
    expect(match('Pump.fun Amm')).toBe(3);
    expect(match('Saber (Decimals)')).toBe(4);
    expect(match('Sanctum Infinity')).toBe(5);
    expect(match('Crema')).toBe(6);
    expect(match('Perena Star V2')).toBe(7);
    expect(match('Boop.fun')).toBe(8);
    expect(match('Orca V2')).toBe(9);
  });

  it('matches whole words only, and declines when unsure', () => {
    const match = (label: string) => matchLabel(label, index)?.id ?? null;
    expect(match('Raydiumx')).toBeNull();
    expect(match('Whirlpool')).toBeNull();
    expect(match('Stableswap')).toBeNull();
    expect(match('M Swap')).toBeNull();
    expect(match('Twin Pools')).toBeNull();
  });

  it('prefers the longest name a label starts with, and a name as written over a shortened one', () => {
    const nested = buildLabelIndex([
      { id: 1, names: ['Jupiter'] },
      { id: 2, names: ['Jupiter Lend'] },
    ]);
    expect(matchLabel('Jupiter Lend Earn', nested)).toEqual({ id: 2, matched: 'jupiter lend' });
    // "Jupiter Lend" shortens to "jupiter", but that must not make "Jupiter" ambiguous.
    expect(matchLabel('Jupiter Perps', nested)).toEqual({ id: 1, matched: 'jupiter' });
  });
});
