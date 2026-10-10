/**
 * Keeps the database small enough for a free hosted Postgres.
 *
 * Token prices arrive every 15 minutes and program activity every hour, which
 * is what the recent charts need and far more than history needs. Readings
 * older than a window are thinned to the last one of each UTC day, so long
 * series survive at daily resolution; import logs older than 30 days go.
 */

import { sql } from 'drizzle-orm';
import { rows, type Executor } from '../client';
import type { JobContext, JobResult } from './context';

const DAY = 86_400_000;
const PRICE_WINDOW_DAYS = 7;
const ACTIVITY_WINDOW_DAYS = 14;
const RUN_LOG_DAYS = 30;

const before = (now: Date, days: number) =>
  sql`to_timestamp(${(now.getTime() - days * DAY) / 1000})`;

/** Delete all but the last reading per subject and UTC day, older than `days`. */
async function thinToDaily(
  db: Executor,
  table: 'market_snapshots' | 'program_activity',
  subject: 'token_id' | 'program_id',
  now: Date,
  days: number,
): Promise<number> {
  const deleted = await rows<{ id: number }>(
    db,
    sql`delete from ${sql.identifier(table)} where id in (
          select id from (
            select id, row_number() over (
              partition by ${sql.identifier(subject)}, (captured_at at time zone 'UTC')::date
              order by captured_at desc, id desc
            ) as rn
            from ${sql.identifier(table)}
            where captured_at < ${before(now, days)}
          ) ranked where rn > 1
        ) returning id`,
  );
  return deleted.length;
}

export async function runMaintenance(ctx: JobContext): Promise<JobResult> {
  const { db, now } = ctx;
  const prices = await thinToDaily(db, 'market_snapshots', 'token_id', now, PRICE_WINDOW_DAYS);
  const activity = await thinToDaily(
    db,
    'program_activity',
    'program_id',
    now,
    ACTIVITY_WINDOW_DAYS,
  );
  const runs = await rows<{ id: number }>(
    db,
    sql`delete from import_runs
        where status <> 'running' and started_at < ${before(now, RUN_LOG_DAYS)}
        returning id`,
  );
  ctx.log(
    `Thinned ${prices} price and ${activity} activity readings; dropped ${runs.length} old runs`,
  );
  return { stats: { prices, activity, runs: runs.length } };
}
