/**
 * A live run of the program, on-chain, people, news and events imports
 * against the real sources, into an in-memory database. Skipped unless
 * `LIVE=1` — it makes a few hundred requests and takes a few minutes.
 *
 *   LIVE=1 pnpm --filter @marketroom/db exec vitest run src/ingest/live-extra.test.ts
 *
 * GitHub allows 60 unauthenticated requests an hour per IP, shared with
 * anything else on the machine; with `GITHUB_TOKEN` set, 5,000. When the
 * hour's budget is already spent, the people import stops at once and says
 * so (`budgetExhausted: 1`) — that is the expected outcome, not a failure.
 */

import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { migrate, openDb, rows } from '../client';
import { runJob } from './runner';

describe.skipIf(!process.env.LIVE)('live import: programs, on-chain, people, news, events', () => {
  it('fills them from the live sources', { timeout: 900_000 }, async () => {
    const handle = await openDb();
    await migrate(handle.db);
    const env = {
      githubToken: process.env.GITHUB_TOKEN ?? null,
      rpcUrl: process.env.SOLANA_RPC_URL ?? null,
    };
    const log = (m: string) => console.log(m);

    const runs: Record<
      string,
      { status: string; error: string | null; stats: Record<string, number> | null }
    > = {};
    for (const job of ['projects', 'programs', 'onchain', 'people', 'news', 'events']) {
      const run = await runJob(handle.db, job, { env, log });
      runs[job] = {
        status: run?.status ?? 'skipped',
        error: run?.error ?? null,
        stats: run?.stats ?? null,
      };
      console.log(job, runs[job].status, runs[job].error ?? '', JSON.stringify(runs[job].stats));
    }

    const [counts] = await rows<Record<string, number>>(
      handle.db,
      sql`select
        (select count(*)::int from projects) as projects,
        (select count(*)::int from programs) as programs,
        (select count(*)::int from programs where verified_build) as verified_programs,
        (select count(*)::int from programs where loader is not null) as programs_read_onchain,
        (select count(distinct program_id)::int from project_programs) as mapped_programs,
        (select count(*)::int from project_programs) as program_links,
        (select count(*)::int from program_activity) as activity_rows,
        (select count(*)::int from program_activity where tx_per_hour is not null) as activity_with_rate,
        (select count(*)::int from people) as people,
        (select count(*)::int from project_people) as project_people,
        (select count(*)::int from news) as news,
        (select count(*)::int from news_mentions) as mentions,
        (select count(*)::int from events) as events,
        (select count(*)::int from events where kind = 'incident') as incidents,
        (select count(*)::int from event_links) as event_links,
        (select count(*)::int from changes) as changes`,
    );
    console.log(counts);

    // A sample of what was written, to eyeball.
    console.log(
      await rows(
        handle.db,
        sql`select pr.name as project, pg.name as program, pg.loader, pp.review_status, left(pp.note, 90) as note
            from project_programs pp join projects pr on pr.id = pp.project_id join programs pg on pg.id = pp.program_id
            order by pp.id limit 12`,
      ),
    );
    console.log(
      await rows(
        handle.db,
        sql`select pg.name, a.sample_size, round(a.tx_per_hour::numeric, 2) as tx_per_hour, a.latest_tx_at, a.provider, a.method
            from program_activity a join programs pg on pg.id = a.program_id order by a.tx_per_hour desc nulls last limit 6`,
      ),
    );

    for (const job of ['programs', 'onchain', 'news', 'events']) {
      expect(runs[job]!.status, `${job}: ${runs[job]!.error ?? ''}`).not.toBe('error');
    }
    expect(['ok', 'partial']).toContain(runs.people!.status);
    expect(counts!.programs).toBeGreaterThan(400);
    expect(counts!.mapped_programs).toBeGreaterThan(10);
    expect(counts!.activity_rows).toBeGreaterThan(0);
    expect(counts!.news).toBeGreaterThan(10);
    expect(counts!.events).toBeGreaterThan(10);
    // A first run of each job is a bootstrap: it writes no change log.
    expect(counts!.changes).toBe(0);
    await handle.close();
  });
});
