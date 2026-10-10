/**
 * A live import against the real sources, into an in-memory database.
 * Skipped unless `LIVE=1` — it makes network requests and takes a minute.
 *
 *   LIVE=1 pnpm --filter @marketroom/db exec vitest run src/ingest/live.test.ts
 */

import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate, openDb, rows } from '../client';
import { runDueJobs } from './runner';

describe.skipIf(!process.env.LIVE)('live import', () => {
  it('fills an empty database from the live sources', { timeout: 600_000 }, async () => {
    const handle = await openDb();
    await migrate(handle.db);
    const runs = await runDueJobs(handle.db, { env: {}, log: (m) => console.log(m) });
    for (const r of runs) console.log(r.job, r.status, r.error ?? '', JSON.stringify(r.stats));
    const counts = await rows<Record<string, number>>(
      handle.db,
      sql`select
        (select count(*)::int from projects) as projects,
        (select count(*)::int from tokens) as tokens,
        (select count(*)::int from market_snapshots) as snapshots,
        (select count(*)::int from funding_rounds) as rounds,
        (select count(*)::int from round_investors) as round_investors,
        (select count(*)::int from organizations) as organizations,
        (select count(*)::int from people) as people,
        (select count(*)::int from events) as events,
        (select count(*)::int from sources) as sources,
        (select count(*)::int from evidence) as evidence`,
    );
    console.log(counts[0]);
    expect(counts[0]!.projects).toBeGreaterThan(100);
    await handle.close();
  });
});
