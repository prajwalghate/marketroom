/**
 * GitHub: who builds what.
 *
 * Verified 2026-10-10 against the REST API. Unauthenticated, GitHub allows 60
 * requests an hour per IP; with a token, 5,000. Every response says what is
 * left in `x-ratelimit-remaining`, and `GET /rate_limit` reads it without
 * spending any — so a run can see it has nothing to spend before it starts.
 *
 * Organisation membership is private by default (`public_members` is empty
 * for most teams), so people are found through code instead: a repository's
 * top contributors by commits. A fork's contributors are the upstream
 * project's engineers, so forks are skipped.
 *
 * Logins are not stable identities. An organisation can be renamed and its
 * old login registered by a stranger — `drift-labs` became
 * `velocity-exchange`, and `drift-labs` now belongs to someone else. Anything
 * found through a login therefore goes to review, never straight to the
 * record.
 */

import { hostOf } from '@marketroom/core';
import { fetchJson, HttpResponseError } from '../http';
import { USER_AGENT } from './rpc';

const API = 'https://api.github.com';

export interface GithubOwner {
  readonly login: string;
  readonly kind: 'organization' | 'user';
  readonly name: string | null;
  readonly blog: string | null;
  readonly twitter: string | null;
  /** Unix ms. A login re-registered last month is not the team DefiLlama meant. */
  readonly createdAt: number | null;
}

export interface GithubRepo {
  readonly owner: string;
  readonly name: string;
  readonly fork: boolean;
  readonly archived: boolean;
  readonly stars: number;
  readonly pushedAt: number | null;
}

export interface GithubContributor {
  readonly login: string;
  /** `User`, `Bot`, or `Anonymous`. */
  readonly type: string;
  /** Commits to the default branch. */
  readonly contributions: number;
}

export interface GithubUser {
  readonly login: string;
  readonly type: string;
  readonly name: string | null;
  readonly avatarUrl: string | null;
  readonly bio: string | null;
  readonly location: string | null;
  readonly twitter: string | null;
  readonly blog: string | null;
}

interface WireOwner {
  login?: string;
  type?: string;
  name?: string | null;
  blog?: string | null;
  twitter_username?: string | null;
  created_at?: string | null;
}

interface WireRepo {
  name?: string;
  owner?: { login?: string };
  fork?: boolean;
  archived?: boolean;
  stargazers_count?: number;
  pushed_at?: string | null;
}

interface WireUser extends WireOwner {
  avatar_url?: string | null;
  bio?: string | null;
  location?: string | null;
}

const text = (value: string | null | undefined) => value?.trim() || null;

const time = (value: string | null | undefined) => {
  const ms = value ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : null;
};

// ---------------------------------------------------------------------------
// Choosing what to read
// ---------------------------------------------------------------------------

const KNOWN_BOTS = new Set([
  'dependabot',
  'renovate',
  'github-actions',
  'mergify',
  'codecov',
  'imgbot',
  'greenkeeper',
  'allcontributors',
  'web-flow',
  'copilot',
  'coderabbitai',
  'devin-ai-integration',
]);

/** Automation that commits under a user account: `renovate-bot`, `ci_bot`, `dependabot[bot]`. */
export function isBotLogin(login: string): boolean {
  const lower = login.toLowerCase();
  return /\[bot\]$/.test(lower) || /(^|[-_])bot$/.test(lower) || KNOWN_BOTS.has(lower);
}

/**
 * The people worth recording from a contributor list: humans with at least
 * `minCommits` commits, most active first. A handful of commits is a drive-by
 * fix, not a member of the team.
 */
export function pickContributors(
  list: readonly GithubContributor[],
  options: { minCommits?: number; max?: number } = {},
): GithubContributor[] {
  const minCommits = options.minCommits ?? 10;
  return list
    .filter((c) => c.type === 'User' && !isBotLogin(c.login) && c.contributions >= minCommits)
    .sort((a, b) => b.contributions - a.contributions)
    .slice(0, options.max ?? 8);
}

/**
 * Which repositories to read contributors from.
 *
 * A verified build's repository is the deployed program's own source, so it
 * comes first — unless the organisation's listing shows it is a fork. Failing
 * that, the most-starred original, unarchived repository among those pushed
 * to most recently; one with almost no stars says too little about a team to
 * be worth a request.
 */
export function pickRepos(
  listing: readonly GithubRepo[],
  preferred: readonly string[],
  options: { max?: number; minStars?: number } = {},
): string[] {
  const max = options.max ?? 2;
  const byName = new Map(listing.map((r) => [r.name.toLowerCase(), r]));
  const chosen = new Map<string, string>();
  for (const name of preferred) {
    const listed = byName.get(name.toLowerCase());
    if (listed?.fork) continue;
    chosen.set(name.toLowerCase(), listed?.name ?? name);
  }
  if (chosen.size) return [...chosen.values()].slice(0, max);
  return listing
    .filter((r) => !r.fork && !r.archived && r.stars >= (options.minStars ?? 5))
    .sort((a, b) => b.stars - a.stars)
    .slice(0, max)
    .map((r) => r.name);
}

// ---------------------------------------------------------------------------
// Comparing what a profile says with what a record says
// ---------------------------------------------------------------------------

/** A profile's `blog` as a link: GitHub stores whatever was typed, scheme or not. */
export function websiteFromBlog(blog: string | null | undefined): string | null {
  const trimmed = blog?.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const host = hostOf(withScheme);
  return host && host.includes('.') ? withScheme : null;
}

/** Whether two links name the same site: same host, ignoring scheme, `www.` and path. */
export function sameSite(a: string | null | undefined, b: string | null | undefined): boolean {
  const hostA = hostOf(websiteFromBlog(a) ?? '');
  const hostB = hostOf(websiteFromBlog(b) ?? '');
  return hostA !== null && hostA === hostB;
}

/** An X handle from a handle, `@handle`, or profile link. Lower-cased: handles are case-insensitive. */
export function twitterHandle(value: string | null | undefined): string | null {
  const handle = value
    ?.trim()
    .replace(/^https?:\/\/(www\.|mobile\.)?(twitter|x)\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
  return handle && /^[a-z0-9_]{1,15}$/.test(handle) ? handle : null;
}

export const sameHandle = (a: string | null | undefined, b: string | null | undefined) => {
  const handle = twitterHandle(a);
  return handle !== null && handle === twitterHandle(b);
};

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * This run's share of the rate limit is spent. Not a failure of the data:
 * the job stops where it is and the next run carries on.
 */
export class GithubBudgetExhausted extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GithubBudgetExhausted';
  }
}

export interface GithubOptions {
  readonly token?: string | null;
  readonly signal?: AbortSignal;
  /** Requests this client may make before it stops. */
  readonly maxCalls: number;
  /** Stop once GitHub reports fewer than this many requests left, for whoever else shares the limit. */
  readonly reserve?: number;
}

export class GitHub {
  private calls = 0;
  private left: number | null = null;

  constructor(private readonly options: GithubOptions) {}

  /** Requests made so far, not counting the free rate-limit check. */
  get used(): number {
    return this.calls;
  }

  /** What GitHub last said was left this hour; `null` before the first answer. */
  get remaining(): number | null {
    return this.left;
  }

  private headers(): Record<string, string> {
    return {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': USER_AGENT,
      ...(this.options.token ? { Authorization: `Bearer ${this.options.token}` } : {}),
    };
  }

  private track(headers: Headers) {
    const value = headers.get('x-ratelimit-remaining');
    if (value !== null && Number.isFinite(Number(value))) this.left = Number(value);
  }

  /** The core rate limit as it stands. Free: this endpoint does not count against it. */
  async rateLimit(): Promise<{ remaining: number; limit: number; resetAt: number } | null> {
    const response = await fetchJson<{
      resources?: { core?: { remaining?: number; limit?: number; reset?: number } };
    }>(`${API}/rate_limit`, {
      headers: this.headers(),
      signal: this.options.signal,
      timeoutMs: 15_000,
      retries: 1,
    });
    const core = response.data?.resources?.core;
    if (!core || typeof core.remaining !== 'number') return null;
    this.left = core.remaining;
    return { remaining: core.remaining, limit: core.limit ?? 0, resetAt: (core.reset ?? 0) * 1000 };
  }

  /** One API request against the budget. `null` for 404 (and for 204's empty body). */
  private async get<T>(path: string): Promise<T | null> {
    if (this.calls >= this.options.maxCalls) {
      throw new GithubBudgetExhausted(`Used this run's ${this.options.maxCalls} GitHub requests.`);
    }
    const reserve = this.options.reserve ?? 5;
    if (this.left !== null && this.left < reserve) {
      throw new GithubBudgetExhausted(`GitHub reports ${this.left} requests left this hour.`);
    }
    this.calls += 1;
    try {
      // No automatic retries: a retried 429 spends budget to be refused again.
      const response = await fetchJson<T>(`${API}${path}`, {
        headers: this.headers(),
        signal: this.options.signal,
        timeoutMs: 20_000,
        retries: 0,
      });
      this.track(response.headers);
      return response.data;
    } catch (error) {
      if (error instanceof HttpResponseError) {
        this.track(error.headers);
        if (error.status === 404) return null;
        if (
          (error.status === 403 || error.status === 429) &&
          (this.left === 0 || /rate limit/i.test(error.body))
        ) {
          this.left = 0;
          throw new GithubBudgetExhausted('GitHub rate limit reached.');
        }
      }
      throw error;
    }
  }

  /** An organisation — or, when no organisation has that login, a user account. */
  async owner(login: string): Promise<GithubOwner | null> {
    const path = encodeURIComponent(login);
    const found =
      (await this.get<WireOwner>(`/orgs/${path}`)) ?? (await this.get<WireOwner>(`/users/${path}`));
    if (!found?.login) return null;
    return {
      login: found.login,
      kind: found.type === 'Organization' ? 'organization' : 'user',
      name: text(found.name),
      blog: text(found.blog),
      twitter: text(found.twitter_username),
      createdAt: time(found.created_at),
    };
  }

  /** The owner's 30 most recently pushed public repositories. */
  async repos(owner: GithubOwner): Promise<GithubRepo[]> {
    const login = encodeURIComponent(owner.login);
    const path =
      owner.kind === 'organization'
        ? `/orgs/${login}/repos?type=public&sort=pushed&per_page=30`
        : `/users/${login}/repos?type=owner&sort=pushed&per_page=30`;
    const list = await this.get<WireRepo[]>(path);
    return (Array.isArray(list) ? list : [])
      .filter((r) => r.name)
      .map((r) => ({
        owner: r.owner?.login ?? owner.login,
        name: r.name!,
        fork: r.fork === true,
        archived: r.archived === true,
        stars: typeof r.stargazers_count === 'number' ? r.stargazers_count : 0,
        pushedAt: time(r.pushed_at),
      }));
  }

  /** A repository's top contributors by commits. Renamed repositories redirect, and are followed. */
  async contributors(owner: string, repo: string, perPage = 15): Promise<GithubContributor[]> {
    const list = await this.get<{ login?: string; type?: string; contributions?: number }[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contributors?per_page=${perPage}`,
    );
    return (Array.isArray(list) ? list : [])
      .filter((c) => c.login)
      .map((c) => ({
        login: c.login!,
        type: c.type ?? 'User',
        contributions: typeof c.contributions === 'number' ? c.contributions : 0,
      }));
  }

  async user(login: string): Promise<GithubUser | null> {
    const u = await this.get<WireUser>(`/users/${encodeURIComponent(login)}`);
    if (!u?.login) return null;
    return {
      login: u.login,
      type: u.type ?? 'User',
      name: text(u.name),
      avatarUrl: text(u.avatar_url),
      bio: text(u.bio),
      location: text(u.location),
      twitter: text(u.twitter_username),
      blog: text(u.blog),
    };
  }
}
