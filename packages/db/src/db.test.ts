import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate, openDb, rows, type DbHandle } from './client';
import {
  addRoundInvestor,
  convertParty,
  createRecord,
  linkPerson,
  mergeRecords,
  setReview,
  updateRecord,
  EditError,
} from './edit';
import { loadDirectory, queryDirectory } from './read/directory';
import { findOrganizationId, loadInvestorProfile } from './read/investors';
import { findProjectId, loadProjectProfile } from './read/project';
import { loadRoundProfile } from './read/rounds';
import { search } from './read/search';
import { loadUpdates } from './read/feed';
import { loadDuplicates, loadQueue } from './read/admin';
import {
  fundingRounds,
  organizations,
  programActivity,
  programs,
  projectMetrics,
  projectPrograms,
  projects,
  roundInvestors,
  tokens,
} from './schema';
import { addAliases, EvidenceRuleError, unlockedSet, upsertEvidence, upsertSources } from './write';

let handle: DbHandle;
const ids = {
  kamino: 0,
  drift: 0,
  multicoin: 0,
  multicoinDup: 0,
  angel: 0,
  seed: 0,
  series: 0,
  program: 0,
};

beforeAll(async () => {
  handle = await openDb();
  await migrate(handle.db);
  const { db } = handle;

  const [kamino, drift] = await db
    .insert(projects)
    .values([
      {
        slug: 'kamino',
        name: 'Kamino',
        category: 'Lending',
        tagline: 'Lending and liquidity on Solana.',
        defillamaKey: 'kamino',
      },
      {
        slug: 'drift',
        name: 'Drift',
        category: 'Derivatives',
        tagline: 'Perpetuals exchange.',
        defillamaKey: 'drift',
      },
    ])
    .returning({ id: projects.id });
  ids.kamino = kamino!.id;
  ids.drift = drift!.id;
  await addAliases(db, 'project', [
    { subjectId: ids.kamino, name: 'Kamino' },
    { subjectId: ids.kamino, name: 'Kamino Finance' },
    { subjectId: ids.drift, name: 'Drift' },
  ]);
  await db.insert(projectMetrics).values([
    { projectId: ids.kamino, tvlSolana: 2e9, provider: 'DefiLlama' },
    { projectId: ids.drift, tvlSolana: 5e8, provider: 'DefiLlama' },
  ]);
  await db.insert(tokens).values({
    mint: 'KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS',
    projectId: ids.kamino,
    symbol: 'KMNO',
    isPrimary: true,
  });

  const [mc, mc2] = await db
    .insert(organizations)
    .values([
      {
        slug: 'multicoin-capital',
        name: 'Multicoin Capital',
        isInvestor: true,
        website: 'https://multicoin.capital',
      },
      {
        slug: 'multicoin',
        name: 'Multicoin',
        isInvestor: true,
        website: 'https://multicoin.capital/',
      },
    ])
    .returning({ id: organizations.id });
  ids.multicoin = mc!.id;
  ids.multicoinDup = mc2!.id;
  await addAliases(db, 'organization', [
    { subjectId: ids.multicoin, name: 'Multicoin Capital' },
    { subjectId: ids.multicoinDup, name: 'Multicoin' },
  ]);
  const [angel] = await db
    .insert(organizations)
    .values({ slug: 'anatoly-yakovenko', name: 'Anatoly Yakovenko', isInvestor: true })
    .returning({ id: organizations.id });
  ids.angel = angel!.id;

  const [seed, series] = await db
    .insert(fundingRounds)
    .values([
      {
        slug: 'drift-seed-2021-07',
        projectId: ids.drift,
        roundType: 'Seed',
        amountUsd: 3.8e6,
        announcedOn: '2021-07-01',
      },
      {
        slug: 'drift-series-a-2022-01',
        projectId: ids.drift,
        roundType: 'Series A',
        amountUsd: 23.5e6,
        announcedOn: '2022-01-15',
      },
    ])
    .returning({ id: fundingRounds.id });
  ids.seed = seed!.id;
  ids.series = series!.id;
  await db.insert(roundInvestors).values([
    { roundId: ids.seed, organizationId: ids.multicoin, isLead: true },
    { roundId: ids.seed, organizationId: ids.multicoinDup, isLead: false },
    { roundId: ids.series, organizationId: ids.multicoin, isLead: true },
    { roundId: ids.series, organizationId: ids.angel, isLead: false },
  ]);
  const sourceIds = await upsertSources(db, [
    { url: 'https://www.theblock.co/post/1/drift-seed?utm_source=x' },
  ]);
  await upsertEvidence(db, [
    {
      subjectType: 'round',
      subjectId: ids.seed,
      field: 'amountUsd',
      sourceId: [...sourceIds.values()][0]!,
      method: 'imported',
      checkedBy: 'import:test',
    },
  ]);

  const [program] = await db
    .insert(programs)
    .values({ address: 'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH', name: 'Drift v2' })
    .returning({ id: programs.id });
  ids.program = program!.id;
  await db
    .insert(projectPrograms)
    .values({ projectId: ids.drift, programId: ids.program, reviewStatus: 'needs_review' });
  await db.insert(programActivity).values({
    programId: ids.program,
    sampleSize: 1000,
    windowSeconds: 600,
    txPerHour: 6000,
    latestTxAt: new Date(),
    provider: 'test',
    method: 'test',
  });
});

afterAll(async () => {
  await handle.close();
});

describe('migrations', () => {
  it('are idempotent', async () => {
    expect(await migrate(handle.db)).toEqual([]);
  });
});

describe('evidence rules', () => {
  it('refuses an on-chain source as evidence of a funding round', async () => {
    const ids2 = await upsertSources(handle.db, [{ url: 'https://solscan.io/tx/abc' }]);
    await expect(
      upsertEvidence(handle.db, [
        {
          subjectType: 'round',
          subjectId: ids.seed,
          sourceId: [...ids2.values()][0]!,
          method: 'imported',
          checkedBy: 't',
        },
      ]),
    ).rejects.toBeInstanceOf(EvidenceRuleError);
  });

  it('canonicalises source links', async () => {
    const found = await rows<{ url: string }>(
      handle.db,
      sql`select url from sources where url like '%theblock%'`,
    );
    expect(found.map((f) => f.url)).toEqual(['https://www.theblock.co/post/1/drift-seed']);
  });

  it('needs an announcement to create a round', async () => {
    await expect(
      createRecord(handle.db, {
        type: 'round',
        values: { projectId: ids.drift, announcedOn: '2024-01-01' },
        actor: 'ed',
      }),
    ).rejects.toBeInstanceOf(EditError);
  });
});

describe('editing and imports', () => {
  it('locks an edited field against imports, and updates the rest', async () => {
    const { db } = handle;
    await updateRecord(db, {
      type: 'project',
      id: ids.kamino,
      patch: { name: 'Kamino Finance' },
      actor: 'editor@test',
      source: { url: 'https://kamino.finance' },
    });
    await db
      .insert(projects)
      .values({
        slug: 'kamino-x',
        name: 'Kamino (import)',
        description: 'Fresh from the import',
        defillamaKey: 'kamino',
      })
      .onConflictDoUpdate({
        target: projects.defillamaKey,
        set: unlockedSet(projects, projects as never, ['name', 'description']),
      });
    const [row] = await rows<{ name: string; description: string; locked_fields: string[] }>(
      db,
      sql`select name, description, locked_fields from projects where id = ${ids.kamino}`,
    );
    expect(row).toEqual({
      name: 'Kamino Finance',
      description: 'Fresh from the import',
      locked_fields: ['name'],
    });
  });

  it('records who changed what', async () => {
    const [c] = await rows<{ actor: string; diff: Record<string, { from: unknown; to: unknown }> }>(
      handle.db,
      sql`select actor, diff from changes where action = 'record.updated' order by id desc limit 1`,
    );
    expect(c!.actor).toBe('editor@test');
    expect(c!.diff.name).toEqual({ from: 'Kamino', to: 'Kamino Finance' });
  });

  it('keeps a rejected record rejected through a re-import', async () => {
    const { db } = handle;
    const [ghost] = await db
      .insert(projects)
      .values({ slug: 'ghost', name: 'Ghost', defillamaKey: 'ghost', reviewStatus: 'rejected' })
      .returning({ id: projects.id });
    await db
      .insert(projects)
      .values({ slug: 'ghost-2', name: 'Ghost Revived', defillamaKey: 'ghost' })
      .onConflictDoUpdate({
        target: projects.defillamaKey,
        set: unlockedSet(projects, projects as never, ['name']),
        setWhere: sql`${projects.reviewStatus} <> 'rejected'`,
      });
    const [row] = await rows<{ name: string; review_status: string }>(
      db,
      sql`select name, review_status from projects where id = ${ghost!.id}`,
    );
    expect(row).toEqual({ name: 'Ghost', review_status: 'rejected' });
  });

  it('stamps a check with who and when', async () => {
    await setReview(handle.db, {
      target: 'round',
      id: ids.seed,
      status: 'verified',
      actor: 'editor@test',
    });
    const profile = await loadRoundProfile(handle.db, ids.seed);
    expect(profile!.round.reviewStatus).toBe('verified');
    expect(profile!.round.checkedBy).toBe('editor@test');
    expect(profile!.round.checkedAt).toBeGreaterThan(Date.now() - 60_000);
  });
});

describe('connections', () => {
  it('links a new person to a project with a source, and finds them again by name', async () => {
    const { db } = handle;
    await linkPerson(db, {
      to: 'project',
      targetId: ids.drift,
      person: { name: 'Cindy Leow' },
      role: 'Co-founder',
      isCurrent: true,
      source: { url: 'https://www.drift.trade/about' },
      actor: 'editor@test',
    });
    await linkPerson(db, {
      to: 'project',
      targetId: ids.drift,
      person: { name: 'Cindy  Leow' },
      role: 'Co-founder',
      isCurrent: true,
      actor: 'editor@test',
    });
    const profile = await loadProjectProfile(db, ids.drift);
    expect(profile!.team).toHaveLength(1);
    expect(profile!.team[0]!.person.name).toBe('Cindy Leow');
  });

  it('assembles a project with its rounds, investors, programs and sources', async () => {
    const profile = await loadProjectProfile(handle.db, ids.drift);
    expect(profile!.rounds.map((r) => r.roundType)).toEqual(['Series A', 'Seed']);
    expect(profile!.investors[0]!.party.name).toBe('Multicoin Capital');
    expect(profile!.investors[0]!.isLead).toBe(true);
    expect(profile!.programs[0]!.activity!.level).toBe('high');
    expect(profile!.sources.some((s) => s.source.publisher === 'The Block')).toBe(true);
  });

  it('adds an angel to a round and refuses a non-announcement source', async () => {
    await expect(
      addRoundInvestor(handle.db, {
        roundId: ids.series,
        party: { type: 'person', name: 'Raj Gokal' },
        isLead: false,
        source: { url: 'https://explorer.solana.com/tx/xyz' },
        actor: 'editor@test',
      }),
    ).rejects.toBeInstanceOf(EvidenceRuleError);
  });
});

describe('directory', () => {
  it('filters with facet counts that ignore their own filter', async () => {
    const all = await loadDirectory(handle.db);
    const page = queryDirectory(all, { investor: 'multicoin-capital' });
    expect(page.rows.map((r) => r.slug)).toEqual(['drift']);
    expect(page.facets.round.map((f) => f.value).sort()).toEqual(['Seed', 'Series A']);
    const byActivity = queryDirectory(all, { activity: 'high' });
    expect(byActivity.rows.map((r) => r.slug)).toEqual(['drift']);
    const byQuery = queryDirectory(all, { q: 'kmno' });
    expect(byQuery.rows.map((r) => r.slug)).toEqual(['kamino']);
  });
});

describe('search', () => {
  it('finds projects by alias, tokens by symbol and programs by address', async () => {
    const hits = await search(handle.db, 'kamino');
    expect(hits[0]).toMatchObject({ type: 'project', key: 'kamino' });
    expect((await search(handle.db, 'KMNO'))[0]).toMatchObject({ type: 'token' });
    expect((await search(handle.db, 'dRiftyHA39'))[0]).toMatchObject({
      type: 'program',
      href: '/programs/dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH',
    });
    expect(
      (await search(handle.db, 'multicoin')).filter((h) => h.type === 'investor'),
    ).toHaveLength(2);
  });
});

describe('duplicates', () => {
  it('suggests, merges, and redirects', async () => {
    const { db } = handle;
    const dupes = await loadDuplicates(db, 'organization');
    expect(dupes[0]).toMatchObject({ reasons: ['similar name', 'same website'] });

    await mergeRecords(db, {
      type: 'organization',
      winnerId: ids.multicoin,
      loserId: ids.multicoinDup,
      actor: 'editor@test',
    });
    const profile = await loadInvestorProfile(db, ids.multicoin);
    // Both were in the seed round; one link survives.
    expect(profile!.deals.filter((d) => d.round.slug === 'drift-seed-2021-07')).toHaveLength(1);
    expect(await findOrganizationId(db, 'multicoin')).toEqual({
      kind: 'redirect',
      slug: 'multicoin-capital',
    });
    expect(await loadDuplicates(db, 'organization')).toEqual([]);
  });

  it('converts an investor imported as an organisation into a person', async () => {
    const { db } = handle;
    const { slug } = await convertParty(db, {
      from: 'organization',
      id: ids.angel,
      actor: 'editor@test',
    });
    const round = await loadRoundProfile(db, ids.series);
    const angel = round!.investors.find((i) => i.party.name === 'Anatoly Yakovenko');
    expect(angel!.party).toMatchObject({ type: 'person', slug });
  });
});

describe('updates and review', () => {
  it('feeds editor changes to watchers of the record', async () => {
    const all = await loadUpdates(handle.db, { watch: [{ type: 'project', slug: 'drift' }] });
    expect(all.some((u) => u.subject?.slug === 'drift')).toBe(true);
    const none = await loadUpdates(handle.db, {
      watch: [{ type: 'project', slug: 'nothing-here' }],
    });
    expect(none).toEqual([]);
  });

  it('queues automatic program mappings for review', async () => {
    const queue = await loadQueue(handle.db, 'project_program');
    expect(queue.items[0]!.title).toBe('Drift → Drift v2');
  });

  it('redirects a project typed by name', async () => {
    expect(await findProjectId(handle.db, 'kamino-finance')).toEqual({
      kind: 'redirect',
      slug: 'kamino',
    });
  });
});
