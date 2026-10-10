import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GitHub,
  GithubBudgetExhausted,
  isBotLogin,
  pickContributors,
  pickRepos,
  sameHandle,
  sameSite,
  twitterHandle,
  websiteFromBlog,
  type GithubContributor,
  type GithubRepo,
} from './github';

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8')) as unknown;

describe('choosing contributors', () => {
  it('keeps humans with at least ten commits, most active first', () => {
    // Kamino-Finance/klend, 2026-10-10: only one contributor clears the bar.
    const picked = pickContributors(fixture('github-contributors.json') as GithubContributor[]);
    expect(picked.map((c) => c.login)).toEqual(['oeble']);
  });

  it('drops bots and caps the list', () => {
    const list: GithubContributor[] = [
      { login: 'dependabot[bot]', type: 'Bot', contributions: 500 },
      { login: 'renovate-bot', type: 'User', contributions: 300 },
      { login: 'talbot', type: 'User', contributions: 50 },
      ...Array.from({ length: 12 }, (_, i) => ({
        login: `dev${i}`,
        type: 'User',
        contributions: 20 + i,
      })),
    ];
    const picked = pickContributors(list, { max: 8 });
    expect(picked).toHaveLength(8);
    expect(picked[0]!.login).toBe('talbot');
    expect(picked.some((c) => c.login.includes('bot]'))).toBe(false);
    expect(isBotLogin('github-actions')).toBe(true);
    expect(isBotLogin('ci_bot')).toBe(true);
    expect(isBotLogin('abbot')).toBe(false);
  });
});

describe('choosing repositories', () => {
  const repo = (name: string, over: Partial<GithubRepo> = {}): GithubRepo => ({
    owner: 'org',
    name,
    fork: false,
    archived: false,
    stars: 10,
    pushedAt: null,
    ...over,
  });

  it('reads the verified build’s repository first, unless the listing shows a fork', () => {
    const listing = [repo('Protocol-V2', { stars: 900 }), repo('spl-fork', { fork: true })];
    expect(pickRepos(listing, ['protocol-v2'])).toEqual(['Protocol-V2']);
    // The only verified repository is a fork: fall back to the organisation's own work.
    expect(pickRepos(listing, ['spl-fork'])).toEqual(['Protocol-V2']);
    // Not in the 30 most recently pushed: still the program's own source.
    expect(pickRepos(listing, ['older-program'])).toEqual(['older-program']);
  });

  it('otherwise takes the most-starred originals, and nothing with almost no stars', () => {
    const listing = [
      repo('docs', { stars: 3 }),
      repo('sdk', { stars: 120 }),
      repo('core', { stars: 800 }),
      repo('old', { stars: 2000, archived: true }),
      repo('upstream', { stars: 5000, fork: true }),
      repo('app', { stars: 40 }),
    ];
    expect(pickRepos(listing, [])).toEqual(['core', 'sdk']);
    expect(pickRepos([repo('fresh', { stars: 0 })], [])).toEqual([]);
  });
});

describe('comparing profiles with records', () => {
  it('reads a profile’s blog as a link', () => {
    expect(websiteFromBlog('jup.ag')).toBe('https://jup.ag');
    expect(websiteFromBlog('https://kamino.finance/')).toBe('https://kamino.finance/');
    expect(websiteFromBlog('')).toBeNull();
    expect(websiteFromBlog('localhost')).toBeNull();
  });

  it('compares sites by host and handles case-insensitively', () => {
    expect(sameSite('https://jup.ag', 'jup.ag/')).toBe(true);
    expect(sameSite('https://www.jup.ag/swap', 'https://jup.ag')).toBe(true);
    expect(sameSite('https://app.kamino.finance', 'https://kamino.finance')).toBe(false);
    expect(sameSite(null, 'https://jup.ag')).toBe(false);
    expect(twitterHandle('https://x.com/JupiterExchange?s=20')).toBe('jupiterexchange');
    expect(sameHandle('@JupiterExchange', 'jupiterexchange')).toBe(true);
    expect(sameHandle('JupiterExchange', null)).toBe(false);
  });
});

describe('GitHub client', () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
  });

  const json = (body: unknown, remaining: number, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'x-ratelimit-remaining': String(remaining), 'content-type': 'application/json' },
    });

  it('falls back from organisation to user, and tracks what is left', async () => {
    const paths: string[] = [];
    globalThis.fetch = (async (url: string) => {
      const path = new URL(url).pathname;
      paths.push(path);
      if (path === '/orgs/0xbigz') return json({ message: 'Not Found' }, 50, 404);
      if (path === '/users/0xbigz') return json(fixture('github-user.json'), 49);
      if (path === '/orgs/jup-ag') return json(fixture('github-org.json'), 48);
      return json({ message: 'Not Found' }, 47, 404);
    }) as typeof fetch;
    const gh = new GitHub({ maxCalls: 10 });
    expect(await gh.owner('0xbigz')).toMatchObject({ login: '0xbigz', kind: 'user', blog: null });
    expect(await gh.owner('jup-ag')).toMatchObject({
      login: 'jup-ag',
      kind: 'organization',
      blog: 'https://jup.ag',
      twitter: 'JupiterExchange',
    });
    expect(paths).toEqual(['/orgs/0xbigz', '/users/0xbigz', '/orgs/jup-ag']);
    expect(gh.used).toBe(3);
    expect(gh.remaining).toBe(48);
  });

  it('stops at the run’s budget without making the request', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return json(fixture('github-user.json'), 40);
    }) as typeof fetch;
    const gh = new GitHub({ maxCalls: 1 });
    await gh.user('0xbigz');
    await expect(gh.user('0xbigz')).rejects.toBeInstanceOf(GithubBudgetExhausted);
    expect(calls).toBe(1);
  });

  it('stops when GitHub reports almost nothing left, or refuses for the rate limit', async () => {
    globalThis.fetch = (async () => json(fixture('github-user.json'), 3)) as typeof fetch;
    const low = new GitHub({ maxCalls: 10, reserve: 5 });
    await low.user('0xbigz');
    await expect(low.user('0xbigz')).rejects.toBeInstanceOf(GithubBudgetExhausted);

    globalThis.fetch = (async () =>
      json({ message: 'API rate limit exceeded for 1.2.3.4.' }, 0, 403)) as typeof fetch;
    await expect(new GitHub({ maxCalls: 10 }).user('x')).rejects.toBeInstanceOf(
      GithubBudgetExhausted,
    );
  });

  it('reads an empty repository’s 204 as no contributors', async () => {
    globalThis.fetch = (async () =>
      new Response(null, {
        status: 204,
        headers: { 'x-ratelimit-remaining': '30' },
      })) as typeof fetch;
    expect(await new GitHub({ maxCalls: 10 }).contributors('org', 'empty')).toEqual([]);
  });

  it('reads the rate limit without spending a request', async () => {
    globalThis.fetch = (async () =>
      json(
        { resources: { core: { remaining: 12, limit: 60, reset: 1791647777 } } },
        12,
      )) as typeof fetch;
    const gh = new GitHub({ maxCalls: 10 });
    expect(await gh.rateLimit()).toEqual({ remaining: 12, limit: 60, resetAt: 1791647777000 });
    expect(gh.used).toBe(0);
    expect(gh.remaining).toBe(12);
  });
});
