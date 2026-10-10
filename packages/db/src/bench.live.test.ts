/**
 * Performance probes against a copy of a real database. Skipped unless
 * `BENCH_DIR` points at a PGlite data directory (copy one; the server holds
 * its own open).
 *
 *   BENCH_DIR=/path/to/copy pnpm --filter @marketroom/db exec vitest run src/bench.live.test.ts
 */

import { describe, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDb, rows } from './client';
import { runJob } from './ingest/runner';
import { loadDirectory } from './read/directory';
import { loadInvestors } from './read/investors';
import { loadPrograms, loadTokens } from './read/onchain';
import { loadPeople } from './read/people';
import { findProjectId, loadProjectProfile } from './read/project';
import { loadRounds } from './read/rounds';
import { search } from './read/search';

const dir = process.env.BENCH_DIR;

describe.skipIf(!dir)('bench', () => {
  it('times the read models', { timeout: 600_000 }, async () => {
    const h = await openDb({ dir: dir! });
    const db = h.db;
    const time = async (label: string, fn: () => Promise<unknown>) => {
      const t0 = performance.now();
      await fn();
      console.log(`${label}: ${Math.round(performance.now() - t0)} ms`);
    };
    for (let i = 0; i < 2; i += 1) {
      await time('directory', () => loadDirectory(db));
      await time('investors', () => loadInvestors(db));
      await time('rounds', () => loadRounds(db));
      await time('programs', () => loadPrograms(db));
      await time('tokens', () => loadTokens(db));
      await time('people', () => loadPeople(db));
      const f = await findProjectId(db, 'drift');
      if (f.kind === 'found') await time('profile drift', () => loadProjectProfile(db, f.value));
      await time('search jup', () => search(db, 'jup'));
    }
    if (process.env.BENCH_EXPLAIN) {
      const plan = await rows<{ 'QUERY PLAN': string }>(
        db,
        sql.raw(`explain (analyze, buffers off) ${process.env.BENCH_EXPLAIN}`),
      );
      console.log(plan.map((p) => p['QUERY PLAN']).join('\n'));
    }
    await h.close();
  });

  it.skipIf(!process.env.BENCH_JOBS)(
    'measures the longest event-loop stall per job',
    { timeout: 900_000 },
    async () => {
      const h = await openDb({ dir: dir! });
      for (const job of process.env.BENCH_JOBS!.split(',')) {
        let last = performance.now();
        let worst = 0;
        const timer = setInterval(() => {
          const now = performance.now();
          worst = Math.max(worst, now - last - 20);
          last = now;
        }, 20);
        const t0 = performance.now();
        const run = await runJob(h.db, job, { env: {} });
        clearInterval(timer);
        console.log(
          `${job}: ${run?.status} in ${Math.round(performance.now() - t0)} ms, worst stall ${Math.round(worst)} ms`,
        );
      }
      await h.close();
    },
  );
});
