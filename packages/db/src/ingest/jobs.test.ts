/**
 * The import jobs' rules, against an in-memory database, with the network
 * stubbed at `fetch`: every job runs its real adapters and parsers on small
 * fixtures, so what is tested is what runs.
 *
 * The rules: editors' work survives re-imports (locked fields, rejected
 * records and links), every automatic mapping waits for review, the change
 * log records only new mappings and links — and nothing on a first run — and
 * names are matched carefully.
 */

import { base58Encode } from '@marketroom/adapters';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { migrate, openDb, rows, type Db, type DbHandle } from '../client';
import {
  eventLinks,
  fundingRounds,
  importRuns,
  marketSnapshots,
  organizations,
  people,
  programActivity,
  programs,
  projectPeople,
  projectPrograms,
  projects,
  roundInvestors,
  tokens,
} from '../schema';
import { addAliases } from '../write';
import type { JobContext } from './context';
import { syncEvents } from './events';
import { reclassifyGuessedPeople } from './funding';
import { runMaintenance } from './maintenance';
import { syncNews } from './news';
import { syncPeople } from './people';
import { syncPrograms } from './programs';
import { registerJob, runJob } from './runner';

// Each block opens its own Postgres (PGlite) in memory; on a busy machine that
// alone can outlast the default ten-second hook timeout.
vi.setConfig({ hookTimeout: 60_000, testTimeout: 60_000 });

const NOW = new Date('2026-10-10T12:00:00Z');

const ctxFor = (db: Db, job: string, bootstrap: boolean): JobContext => ({
  db,
  now: NOW,
  actor: `import:${job}`,
  bootstrap,
  env: {},
  log: () => {},
});

/** A valid, distinct Solana address per seed. */
const address = (seed: number) =>
  base58Encode(Uint8Array.from({ length: 32 }, (_, i) => (seed * 31 + i * 7 + 1) % 256));

const json = (body: unknown, headers: Record<string, string> = {}, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

/** Answers requests by URL; anything unrouted is a 404. Returns the paths requested. */
function stubNetwork(route: (url: URL) => Response | undefined): string[] {
  const requested: string[] = [];
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = new URL(
      typeof input === 'string' ? input : 'url' in input ? input.url : input.href,
    );
    requested.push(`${url.host}${url.pathname}`);
    return route(url) ?? new Response('Not Found', { status: 404 });
  });
  return requested;
}

async function seedProject(
  db: Db,
  name: string,
  values: Partial<typeof projects.$inferInsert> = {},
): Promise<number> {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const [row] = await db
    .insert(projects)
    .values({ slug: key, name, defillamaKey: key, ...values })
    .returning({ id: projects.id });
  await addAliases(db, 'project', [{ subjectId: row!.id, name }]);
  return row!.id;
}

const count = async (db: Db, query: ReturnType<typeof sql>) =>
  (await rows<{ n: number }>(db, query))[0]!.n;

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// programs
// ---------------------------------------------------------------------------

describe('programs import', () => {
  let handle: DbHandle;
  let db: Db;
  const SHA = 'a'.repeat(40);
  const RAYDIUM_CLMM = address(1);
  const METEORA_DLMM = address(2);
  const REJECTED = address(3);
  const ELLIPSIS = address(4);
  const metadao = Array.from({ length: 55 }, (_, i) => address(100 + i));
  const ids = { metadao: 0, raydium: 0, meteora: 0, ellipsis: 0, dlmmLink: 0 };

  const registry = (addresses: readonly string[]) => ({
    status: 'success',
    data: addresses.map((program_id) => ({
      program_id,
      is_verified: true,
      last_verified_at: '2026-09-01T00:00:00.000000',
      repo_url:
        program_id === ELLIPSIS
          ? `https://github.com/Ellipsis-Labs/phoenix-v1/tree/${SHA}`
          : program_id === REJECTED
            ? 'https://github.com/someone/junk'
            : `https://github.com/MetaDAOProject/futarchy/tree/${SHA}`,
      commit: SHA,
    })),
  });
  let listed: string[] = [];
  const labels = {
    [RAYDIUM_CLMM]: 'Raydium CLMM',
    [METEORA_DLMM]: 'Meteora DLMM',
    [address(5)]: 'Orca V2',
  };
  const network = () =>
    stubNetwork((url) => {
      if (url.host === 'verify.osec.io') return json(registry(listed));
      if (url.host === 'lite-api.jup.ag') return json(labels);
      return undefined;
    });

  beforeAll(async () => {
    handle = await openDb();
    await migrate(handle.db);
    db = handle.db;
    // The organisation is listed in a different case than OtterSec's link.
    ids.metadao = await seedProject(db, 'MetaDAO', { githubOrgs: ['metadaoproject'] });
    ids.raydium = await seedProject(db, 'Raydium');
    ids.meteora = await seedProject(db, 'Meteora');
    // Editors' work the import must leave alone.
    await db
      .insert(programs)
      .values([
        { address: RAYDIUM_CLMM, name: 'Raydium Concentrated', lockedFields: ['name'] },
        { address: REJECTED, name: 'Junk', reviewStatus: 'rejected' },
        { address: METEORA_DLMM },
      ]);
    const [dlmm] = await db
      .select({ id: programs.id })
      .from(programs)
      .where(sql`${programs.address} = ${METEORA_DLMM}`);
    const [link] = await db
      .insert(projectPrograms)
      .values({ projectId: ids.meteora, programId: dlmm!.id, reviewStatus: 'rejected' })
      .returning({ id: projectPrograms.id });
    ids.dlmmLink = link!.id;
  });
  afterAll(() => handle.close());

  it('maps programs for review, keeps editors’ work, and logs nothing on a first run', async () => {
    listed = [...metadao, REJECTED, ELLIPSIS];
    network();
    const result = await syncPrograms(ctxFor(db, 'programs', true));
    expect(result.stats).toMatchObject({ verified: 57, linksByRepository: 55, linksByLabel: 1 });

    const [clmm] = await rows<{ name: string; kind: string }>(
      db,
      sql`select name, kind from programs where address = ${RAYDIUM_CLMM}`,
    );
    expect(clmm).toEqual({ name: 'Raydium Concentrated', kind: 'Swap venue' });

    const [junk] = await rows<{ id: number; name: string; verified_build: boolean | null }>(
      db,
      sql`select id, name, verified_build from programs where address = ${REJECTED}`,
    );
    expect(junk).toMatchObject({ name: 'Junk', verified_build: null });
    expect(
      await count(
        db,
        sql`select count(*)::int as n from evidence where subject_type = 'program' and subject_id = ${junk!.id}`,
      ),
    ).toBe(0);

    // Every automatic mapping waits for an editor; Orca has no project to map to.
    const links = await rows<{ project_id: number; review_status: string; note: string }>(
      db,
      sql`select project_id, review_status, note from project_programs where id <> ${ids.dlmmLink}`,
    );
    expect(links).toHaveLength(56);
    expect(links.every((l) => l.review_status === 'needs_review')).toBe(true);
    expect(links.filter((l) => l.project_id === ids.metadao)).toHaveLength(55);
    expect(links.find((l) => l.project_id === ids.raydium)?.note).toMatch(
      /Jupiter labels this program “Raydium CLMM”/,
    );

    const [dlmmLink] = await rows<{ review_status: string }>(
      db,
      sql`select review_status from project_programs where id = ${ids.dlmmLink}`,
    );
    expect(dlmmLink!.review_status).toBe('rejected');
    expect(
      await count(
        db,
        sql`select count(*)::int as n from evidence where subject_type = 'project_program' and subject_id = ${ids.dlmmLink}`,
      ),
    ).toBe(0);
    expect(await count(db, sql`select count(*)::int as n from changes`)).toBe(0);
  });

  it('logs only new mappings on a later run, and keeps locked names', async () => {
    ids.ellipsis = await seedProject(db, 'Ellipsis Labs', { githubOrgs: ['Ellipsis-Labs'] });
    network();
    const result = await syncPrograms(ctxFor(db, 'programs', false));
    expect(result.stats.links).toBe(1);

    const changes = await rows<{ action: string; subject_type: string; subject_id: number }>(
      db,
      sql`select action, subject_type, subject_id from changes`,
    );
    expect(changes).toEqual([
      { action: 'program.linked', subject_type: 'project', subject_id: ids.ellipsis },
    ]);
    expect(
      (
        await rows<{ name: string }>(
          db,
          sql`select name from programs where address = ${RAYDIUM_CLMM}`,
        )
      )[0]!.name,
    ).toBe('Raydium Concentrated');
    expect(
      (
        await rows<{ review_status: string }>(
          db,
          sql`select review_status from project_programs where id = ${ids.dlmmLink}`,
        )
      )[0]!.review_status,
    ).toBe('rejected');
  });

  it('unverifies a program OtterSec drops, but nothing against a truncated list', async () => {
    const dropped = metadao[0]!;
    listed = listed.filter((a) => a !== dropped);
    network();
    expect((await syncPrograms(ctxFor(db, 'programs', false))).stats.unverified).toBe(1);
    const [gone] = await rows<{ id: number; verified_build: boolean }>(
      db,
      sql`select id, verified_build from programs where address = ${dropped}`,
    );
    expect(gone!.verified_build).toBe(false);
    const [note] = await rows<{ note: string }>(
      db,
      sql`select note from evidence where subject_type = 'program' and subject_id = ${gone!.id} and field = 'verifiedBuild'`,
    );
    expect(note!.note).toMatch(/No longer listed by OtterSec/);

    // A response cut short must not strip every program of its badge.
    listed = listed.slice(0, 10);
    network();
    expect((await syncPrograms(ctxFor(db, 'programs', false))).stats.unverified).toBe(0);
    expect(await count(db, sql`select count(*)::int as n from programs where verified_build`)).toBe(
      55,
    );
  });
});

// ---------------------------------------------------------------------------
// people
// ---------------------------------------------------------------------------

describe('people import', () => {
  let handle: DbHandle;
  let db: Db;
  const ids = { kamino: 0, orca: 0, carol: 0, carolLink: 0 };
  let klendContributors: { login: string; type: string; contributions: number }[] = [];
  const users: Record<string, unknown> = {
    alice: {
      login: 'alice',
      type: 'User',
      name: 'Alice Smith',
      avatar_url: 'https://avatars.githubusercontent.com/u/1',
      bio: 'Builds lending markets. Formerly at a bank.',
      location: 'Lisbon',
      twitter_username: 'alice_sol',
      blog: 'alice.dev',
    },
    erin: { login: 'erin', type: 'User', name: 'Erin Park', blog: '' },
    dave: { login: 'dave', type: 'User', name: 'Dave Lee', blog: '' },
  };
  const github = () =>
    stubNetwork((url) => {
      if (url.host !== 'api.github.com') return undefined;
      const headers = { 'x-ratelimit-remaining': '50' };
      const path = url.pathname;
      if (path === '/rate_limit') {
        return json({ resources: { core: { remaining: 60, limit: 60, reset: 1791652017 } } });
      }
      if (path === '/orgs/Kamino-Finance') {
        return json(
          {
            login: 'Kamino-Finance',
            type: 'Organization',
            blog: 'kamino.finance',
            twitter_username: 'KaminoFinance',
          },
          headers,
        );
      }
      if (path === '/orgs/orca-so')
        return json({ login: 'orca-so', type: 'Organization' }, headers);
      if (path === '/orgs/Kamino-Finance/repos') {
        return json(
          [{ name: 'klend', owner: { login: 'Kamino-Finance' }, stargazers_count: 120 }],
          headers,
        );
      }
      if (path === '/orgs/orca-so/repos') {
        return json(
          [
            { name: 'spl-fork', owner: { login: 'orca-so' }, fork: true, stargazers_count: 5000 },
            { name: 'whirlpools', owner: { login: 'orca-so' }, stargazers_count: 400 },
          ],
          headers,
        );
      }
      if (path === '/repos/Kamino-Finance/klend/contributors')
        return json(klendContributors, headers);
      if (path === '/repos/orca-so/whirlpools/contributors') {
        return json([{ login: 'erin', type: 'User', contributions: 30 }], headers);
      }
      if (path === '/repos/orca-so/spl-fork/contributors') {
        return json([{ login: 'upstream-dev', type: 'User', contributions: 900 }], headers);
      }
      const user = path.match(/^\/users\/([^/]+)$/)?.[1];
      if (user && users[user]) return json(users[user], headers);
      return json({ message: 'Not Found' }, headers, 404);
    });

  beforeAll(async () => {
    handle = await openDb();
    await migrate(handle.db);
    db = handle.db;
    ids.kamino = await seedProject(db, 'Kamino', {
      githubOrgs: ['Kamino-Finance'],
      website: 'https://kamino.finance',
      twitter: 'KaminoFinance',
    });
    ids.orca = await seedProject(db, 'Orca', { githubOrgs: ['orca-so'] });
    const [klend] = await db
      .insert(programs)
      .values({
        address: address(9),
        verifiedBuild: true,
        verifiedRepo: 'https://github.com/Kamino-Finance/klend',
      })
      .returning({ id: programs.id });
    await db
      .insert(projectPrograms)
      .values({ projectId: ids.kamino, programId: klend!.id, reviewStatus: 'needs_review' });
    // Already known, under a login written in another case.
    await db.insert(people).values({ slug: 'oeble', name: 'Oeble', github: 'OEBLE' });
    const [carol] = await db
      .insert(people)
      .values({ slug: 'carol', name: 'Carol', github: 'carol' })
      .returning({ id: people.id });
    ids.carol = carol!.id;
    const [link] = await db
      .insert(projectPeople)
      .values({
        projectId: ids.kamino,
        personId: carol!.id,
        role: 'Code contributor',
        reviewStatus: 'rejected',
      })
      .returning({ id: projectPeople.id });
    ids.carolLink = link!.id;
    klendContributors = [
      { login: 'dependabot[bot]', type: 'Bot', contributions: 100 },
      { login: 'renovate-bot', type: 'User', contributions: 80 },
      { login: 'oeble', type: 'User', contributions: 40 },
      { login: 'alice', type: 'User', contributions: 25 },
      { login: 'carol', type: 'User', contributions: 12 },
      { login: 'bob', type: 'User', contributions: 9 },
    ];
  });
  afterAll(() => handle.close());

  it('reuses people by login, skips forks and bots, and logs nothing on a first run', async () => {
    const requested = github();
    const result = await syncPeople(ctxFor(db, 'people', true));
    expect(result.stats).toMatchObject({ projects: 2, people: 2, links: 3, budgetExhausted: 0 });

    // Known logins cost no request; nor do bots, or anyone under ten commits.
    const userRequests = requested.filter((p) => p.startsWith('api.github.com/users/'));
    expect(userRequests.sort()).toEqual([
      'api.github.com/users/alice',
      'api.github.com/users/erin',
    ]);
    // A fork's contributors are someone else's engineers.
    expect(requested).not.toContain('api.github.com/repos/orca-so/spl-fork/contributors');
    expect(requested).toContain('api.github.com/repos/orca-so/whirlpools/contributors');

    const found = await rows<{ github: string; name: string; review_status: string }>(
      db,
      sql`select github, name, review_status from people order by id`,
    );
    expect(found.map((p) => p.github)).toEqual(['OEBLE', 'carol', 'alice', 'erin']);
    expect(found.find((p) => p.github === 'alice')).toMatchObject({
      name: 'Alice Smith',
      review_status: 'unreviewed',
    });

    const links = await rows<{ project_id: number; github: string; review_status: string }>(
      db,
      sql`select pp.project_id, pe.github, pp.review_status from project_people pp
          join people pe on pe.id = pp.person_id order by pp.id`,
    );
    expect(links).toEqual([
      { project_id: ids.kamino, github: 'carol', review_status: 'rejected' },
      { project_id: ids.kamino, github: 'OEBLE', review_status: 'unreviewed' },
      { project_id: ids.kamino, github: 'alice', review_status: 'unreviewed' },
      { project_id: ids.orca, github: 'erin', review_status: 'unreviewed' },
    ]);
    // The rejected link gets nothing new; the others carry their commit counts.
    expect(
      await count(
        db,
        sql`select count(*)::int as n from evidence where subject_type = 'project_person' and subject_id = ${ids.carolLink}`,
      ),
    ).toBe(0);
    const notes = await rows<{ note: string }>(
      db,
      sql`select note from evidence where subject_type = 'project_person' order by note`,
    );
    expect(notes.map((n) => n.note)).toEqual([
      '25 commits to Kamino-Finance/klend',
      '30 commits to orca-so/whirlpools',
      '40 commits to Kamino-Finance/klend',
    ]);
    expect(await count(db, sql`select count(*)::int as n from changes`)).toBe(0);
  });

  it('logs only the new person link on a later run', async () => {
    klendContributors = [...klendContributors, { login: 'dave', type: 'User', contributions: 15 }];
    const requested = github();
    const result = await syncPeople(ctxFor(db, 'people', false));
    expect(result.stats).toMatchObject({ people: 1, links: 1 });
    expect(requested.filter((p) => p.startsWith('api.github.com/users/'))).toEqual([
      'api.github.com/users/dave',
    ]);
    const changes = await rows<{
      action: string;
      subject_type: string;
      subject_id: number;
      summary: string;
    }>(db, sql`select action, subject_type, subject_id, summary from changes`);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      action: 'person.linked',
      subject_type: 'project',
      subject_id: ids.kamino,
    });
    expect(changes[0]!.summary).toMatch(/^Dave Lee — code contributor to Kamino/);
  });
});

// ---------------------------------------------------------------------------
// news
// ---------------------------------------------------------------------------

const rss = (items: { title: string; link: string; description?: string }[]) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title>${items
    .map(
      (i) =>
        `<item><title>${i.title}</title><link>${i.link}</link><pubDate>Fri, 09 Oct 2026 10:00:00 GMT</pubDate>` +
        `<description>${i.description ?? ''}</description></item>`,
    )
    .join('')}</channel></rss>`;

describe('news import', () => {
  let handle: DbHandle;
  let db: Db;
  const ids = { follows: 0, orca: 0, defituna: 0, hedge: 0 };

  beforeAll(async () => {
    handle = await openDb();
    await migrate(handle.db);
    db = handle.db;
    ids.follows = await seedProject(db, 'Follows');
    ids.orca = await seedProject(db, 'Orca');
    ids.defituna = await seedProject(db, 'DefiTuna');
    ids.hedge = await seedProject(db, 'Hedge');
  });
  afterAll(() => handle.close());

  it('matches a one-word project name only as written, in a story about Solana', async () => {
    stubNetwork((url) => {
      // A Solana-focused feed: every story in it is about Solana.
      if (url.href === 'https://solana.com/news/rss.xml') {
        return new Response(
          rss([
            { title: 'Orca ships new vaults', link: 'https://solana.com/news/orca-vaults' },
            {
              title: 'Stake follows yield as validators grow',
              link: 'https://solana.com/news/stake',
            },
            { title: 'Follows launches on mainnet', link: 'https://solana.com/news/follows' },
          ]),
        );
      }
      // A general crypto feed: kept only for Solana, or a name distinctive enough on its own.
      if (url.href === 'https://www.theblock.co/rss.xml') {
        return new Response(
          rss([
            { title: 'Hedge funds pile into bitcoin ETFs', link: 'https://www.theblock.co/post/1' },
            { title: 'DefiTuna launches perpetuals', link: 'https://www.theblock.co/post/2' },
            { title: 'Orca token surges', link: 'https://www.theblock.co/post/3' },
            { title: 'Solana DEX Orca adds new pools', link: 'https://www.theblock.co/post/4' },
          ]),
        );
      }
      return undefined;
    });
    const result = await syncNews(ctxFor(db, 'news', true));
    expect(result.stats).toMatchObject({ kept: 5, offTopic: 2 });
    expect(result.partial).toBe(true); // The other five feeds answered 404.

    const kept = await rows<{ title: string }>(db, sql`select title from news order by id`);
    expect(kept.map((k) => k.title).sort()).toEqual([
      'DefiTuna launches perpetuals',
      'Follows launches on mainnet',
      'Orca ships new vaults',
      'Solana DEX Orca adds new pools',
      'Stake follows yield as validators grow',
    ]);

    const mentions = await rows<{
      title: string;
      subject_id: number;
      matched_by: string;
      review_status: string;
    }>(
      db,
      sql`select n.title, m.subject_id, m.matched_by, m.review_status
          from news_mentions m join news n on n.id = m.news_id order by n.title, m.subject_id`,
    );
    expect(mentions.map((m) => [m.title, m.subject_id])).toEqual([
      ['DefiTuna launches perpetuals', ids.defituna],
      ['Follows launches on mainnet', ids.follows],
      ['Orca ships new vaults', ids.orca],
      ['Solana DEX Orca adds new pools', ids.orca],
    ]);
    expect(
      mentions.every((m) => m.matched_by === 'title' && m.review_status === 'unreviewed'),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------

const eventsPage = (events: { name: string; url: string; startDate: string }[]) =>
  `<!DOCTYPE html><html><head><script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': events.map((e) => ({
      '@type': 'Event',
      '@id': `${e.url}#event`,
      name: e.name,
      url: e.url,
      startDate: e.startDate,
      eventStatus: 'https://schema.org/EventScheduled',
      location: { '@type': 'Place', name: 'London, United Kingdom' },
    })),
  })}</script></head><body></body></html>`;

describe('events import', () => {
  let handle: DbHandle;
  let db: Db;
  const ids = { huma: 0, drift: 0 };
  const network = () =>
    stubNetwork((url) => {
      if (url.href === 'https://solana.com/events') {
        return new Response(
          eventsPage([
            {
              name: '20/20 Vision: Solana x Huma Happy Hour',
              url: 'https://lu.ma/huma',
              startDate: '2026-10-21T00:00:00.000Z',
            },
            {
              name: 'Solana Hacker House - London',
              url: 'https://lu.ma/london-hh',
              startDate: '2026-11-01T10:00:00.000Z',
            },
          ]),
        );
      }
      if (url.href === 'https://api.llama.fi/hacks') {
        return json([
          {
            date: 1652227200,
            name: 'Drift Trade',
            classification: 'Market Manipulation',
            technique: 'Risk Parameter Abuse',
            amount: 14500000,
            chain: ['Solana'],
            returnedFunds: 14500000,
            defillamaId: '970',
            parentProtocolId: 'parent#drift',
          },
          {
            date: 1761004800,
            name: 'DoodiPals',
            classification: 'Key Compromise',
            amount: 171000,
            chain: ['Solana'],
            defillamaId: null,
          },
          {
            date: 1647475200,
            name: 'ApeCoin',
            classification: 'Governance',
            amount: 820000,
            chain: ['Ethereum'],
            defillamaId: '2665',
          },
        ]);
      }
      return undefined;
    });

  beforeAll(async () => {
    handle = await openDb();
    await migrate(handle.db);
    db = handle.db;
    ids.huma = await seedProject(db, 'Huma', { defillamaIds: ['1234'] });
    ids.drift = await seedProject(db, 'Drift', { defillamaIds: ['970', 'parent#drift'] });
  });
  afterAll(() => handle.close());

  it('stores a name-matched link for review, and a source-stated one as stated', async () => {
    network();
    const result = await syncEvents(ctxFor(db, 'events', true));
    expect(result.stats).toMatchObject({ communityEvents: 2, incidents: 2, incidentsLinked: 1 });

    const found = await rows<{ kind: string; title: string; external_key: string }>(
      db,
      sql`select kind, title, external_key from events order by starts_on`,
    );
    expect(found).toEqual([
      {
        kind: 'incident',
        title: 'Security incident: Market Manipulation',
        // Exactly the funding job's key, so the two jobs refresh one event.
        external_key: 'llama:drift:incident:2022-05-11:security-incident-market-manipulation',
      },
      {
        kind: 'incident',
        title: 'Security incident: DoodiPals',
        external_key: 'llama-hack:doodipals:2025-10-21',
      },
      {
        kind: 'conference',
        title: '20/20 Vision: Solana x Huma Happy Hour',
        external_key: 'solana-events:https://lu.ma/huma',
      },
      {
        kind: 'hackathon',
        title: 'Solana Hacker House - London',
        external_key: 'solana-events:https://lu.ma/london-hh',
      },
    ]);

    const links = await rows<{
      subject_id: number;
      matched_by: string | null;
      review_status: string;
    }>(db, sql`select subject_id, matched_by, review_status from event_links order by id`);
    expect(links).toEqual([
      { subject_id: ids.huma, matched_by: 'name', review_status: 'needs_review' },
      { subject_id: ids.drift, matched_by: null, review_status: 'unreviewed' },
    ]);
  });

  it('does not recreate a link an editor rejected', async () => {
    await db
      .update(eventLinks)
      .set({ reviewStatus: 'rejected' })
      .where(sql`${eventLinks.subjectType} = 'project' and ${eventLinks.subjectId} = ${ids.huma}`);
    network();
    const result = await syncEvents(ctxFor(db, 'events', false));
    expect(result.stats.links).toBe(0);
    const huma = await rows<{ review_status: string }>(
      db,
      sql`select review_status from event_links where subject_type = 'project' and subject_id = ${ids.huma}`,
    );
    expect(huma).toEqual([{ review_status: 'rejected' }]);
  });
});

// ---------------------------------------------------------------------------
// funding: names once read as people
// ---------------------------------------------------------------------------

describe('reclassifying guessed people', () => {
  let handle: DbHandle;
  let db: Db;

  beforeAll(async () => {
    handle = await openDb();
    await migrate(handle.db);
    db = handle.db;
  });
  afterAll(async () => handle.close());

  it('turns a guessed "person" that reads as a firm into an organisation, and leaves the rest', async () => {
    const projectId = await seedProject(db, 'Exampleswap');
    const [round] = await db
      .insert(fundingRounds)
      .values({ slug: 'exampleswap-seed', projectId, announcedOn: '2025-01-01' })
      .returning({ id: fundingRounds.id });
    const [round2] = await db
      .insert(fundingRounds)
      .values({ slug: 'exampleswap-a', projectId, announcedOn: '2026-01-01' })
      .returning({ id: fundingRounds.id });
    const guess = async (name: string, values: Partial<typeof people.$inferInsert> = {}) => {
      const [row] = await db
        .insert(people)
        .values({
          slug: name.toLowerCase().replace(/\s+/g, '-'),
          name,
          reviewStatus: 'needs_review',
          ...values,
        })
        .returning({ id: people.id });
      await addAliases(db, 'person', [{ subjectId: row!.id, name }]);
      return row!.id;
    };
    const ark = await guess('Ark Invest');
    const locked = await guess('Forward Industries', { lockedFields: ['name'] });
    const angel = await guess('Raj Gokal');
    // An organisation of the same name already exists and is in round 2.
    const [org] = await db
      .insert(organizations)
      .values({ slug: 'ark-invest', name: 'ARK Invest', isInvestor: true })
      .returning({ id: organizations.id });
    await addAliases(db, 'organization', [{ subjectId: org!.id, name: 'ARK Invest' }]);
    await db.insert(roundInvestors).values([
      { roundId: round!.id, personId: ark },
      { roundId: round2!.id, personId: ark },
      { roundId: round2!.id, organizationId: org!.id },
      { roundId: round!.id, personId: locked },
      { roundId: round!.id, personId: angel },
    ]);

    const n = await reclassifyGuessedPeople(ctxFor(db, 'funding', false));
    expect(n).toBe(1);

    // Ark's links moved to the existing firm, without a duplicate in round 2.
    const links = await rows<{
      round_id: number;
      organization_id: number | null;
      person_id: number | null;
    }>(
      db,
      sql`select round_id, organization_id, person_id from round_investors order by round_id, id`,
    );
    expect(
      links
        .filter((l) => l.organization_id === org!.id)
        .map((l) => l.round_id)
        .sort(),
    ).toEqual([round!.id, round2!.id].sort());
    expect(links.some((l) => l.person_id === ark)).toBe(false);
    const [arkRow] = await rows<{ review_status: string }>(
      db,
      sql`select review_status from people where id = ${ark}`,
    );
    expect(arkRow!.review_status).toBe('rejected');
    expect(await count(db, sql`select count(*)::int as n from organizations`)).toBe(1);

    // A locked record and a real name are left alone.
    expect(links.some((l) => l.person_id === locked)).toBe(true);
    expect(links.some((l) => l.person_id === angel)).toBe(true);

    // Nothing left to do on a second pass.
    expect(await reclassifyGuessedPeople(ctxFor(db, 'funding', false))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// runner: one run per job, across servers
// ---------------------------------------------------------------------------

describe('claiming a run', () => {
  let handle: DbHandle;
  let db: Db;

  beforeAll(async () => {
    handle = await openDb();
    await migrate(handle.db);
    db = handle.db;
  });
  afterAll(async () => handle.close());

  it('lets only one of two simultaneous starts run the job', async () => {
    let calls = 0;
    registerJob('test-claim', {
      label: 'Test',
      description: 'Counts its runs.',
      everyMs: 60_000,
      run: async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { stats: { calls } };
      },
    });
    const [a, b] = await Promise.all([
      runJob(db, 'test-claim', { env: {} }),
      runJob(db, 'test-claim', { env: {} }),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(calls).toBe(1);
    // Once it has finished, the next start runs again.
    expect(await runJob(db, 'test-claim', { env: {} })).not.toBeNull();
    expect(calls).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// maintenance
// ---------------------------------------------------------------------------

describe('maintenance', () => {
  let handle: DbHandle;
  let db: Db;

  beforeAll(async () => {
    handle = await openDb();
    await migrate(handle.db);
    db = handle.db;
  });
  afterAll(async () => handle.close());

  it('thins old readings to the last of each day and keeps recent ones whole', async () => {
    const HOUR = 3_600_000;
    const DAY = 24 * HOUR;
    const [token] = await db
      .insert(tokens)
      .values({ mint: address(900), symbol: 'TEST' })
      .returning({ id: tokens.id });
    const [program] = await db
      .insert(programs)
      .values({ address: address(901) })
      .returning({ id: programs.id });
    const at = (msAgo: number) => new Date(NOW.getTime() - msAgo);
    // Four readings on one UTC day ten days ago (old), and four this morning.
    const times = [10 * DAY + 6 * HOUR, 10 * DAY + 4 * HOUR, 10 * DAY + 2 * HOUR, 10 * DAY]
      .concat([4 * HOUR, 3 * HOUR, 2 * HOUR, HOUR])
      .map(at);
    await db.insert(marketSnapshots).values(
      times.map((capturedAt, i) => ({
        tokenId: token!.id,
        capturedAt,
        price: i,
        provider: 'test',
      })),
    );
    // Activity keeps two weeks whole: twenty days ago is old, ten days is not.
    await db.insert(programActivity).values(
      [20 * DAY, 20 * DAY - HOUR, 20 * DAY - 2 * HOUR, 10 * DAY, 10 * DAY - HOUR].map((ms) => ({
        programId: program!.id,
        capturedAt: at(ms),
        sampleSize: 1,
        txPerHour: 1,
        provider: 'test',
        method: 'test',
      })),
    );
    await db.insert(importRuns).values([
      { job: 'projects', status: 'ok', startedAt: at(40 * DAY) },
      { job: 'projects', status: 'ok', startedAt: at(DAY) },
    ]);

    const result = await runMaintenance(ctxFor(db, 'maintenance', false));

    // The old day keeps one price, its latest; today's four stay.
    const prices = await rows<{ price: number }>(
      db,
      sql`select price from market_snapshots where token_id = ${token!.id} order by captured_at`,
    );
    expect(prices.map((p) => Number(p.price))).toEqual([3, 4, 5, 6, 7]);
    expect(result.stats).toMatchObject({ prices: 3, activity: 2, runs: 1 });
    expect(await count(db, sql`select count(*)::int as n from program_activity`)).toBe(3);
    expect(await count(db, sql`select count(*)::int as n from import_runs`)).toBe(1);

    // Nothing left to thin on a second pass.
    const again = await runMaintenance(ctxFor(db, 'maintenance', false));
    expect(again.stats).toMatchObject({ prices: 0, activity: 0, runs: 0 });
  });
});
