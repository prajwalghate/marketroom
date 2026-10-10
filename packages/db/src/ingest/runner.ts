/**
 * Import jobs: what runs, how often, and the record of every run.
 *
 * Upkeep is continuous. Each job has a cadence matched to how fast its data
 * changes; `runDueJobs` runs whichever are due, one at a time, and every run
 * is logged with what it changed — which is what the admin dashboard shows.
 * The same entry point serves a scheduler (a cron route in production), the
 * dashboard's "run now", and the app's own lazy upkeep in development.
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { importRuns } from '../schema';
import type { JobContext, JobEnv, JobResult } from './context';
import { syncEvents } from './events';
import { syncFunding } from './funding';
import { syncMarkets } from './markets';
import { syncNews } from './news';
import { syncOnchain } from './onchain';
import { syncPeople } from './people';
import { syncPrograms } from './programs';
import { syncProjects } from './projects';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export interface JobDefinition {
  readonly label: string;
  readonly description: string;
  readonly everyMs: number;
  /** Jobs that must have succeeded once before this one can run. */
  readonly after?: readonly string[];
  readonly run: (ctx: JobContext) => Promise<JobResult>;
}

const registry = {
  projects: {
    label: 'Projects',
    description:
      'Solana projects, links, categories, value locked, fees and token mints from DefiLlama.',
    everyMs: 6 * HOUR,
    run: syncProjects,
  },
  markets: {
    label: 'Token markets',
    description:
      'Price, market cap, volume, liquidity and holders for every mapped token, from Jupiter.',
    everyMs: 15 * MINUTE,
    after: ['projects'],
    run: syncMarkets,
  },
  funding: {
    label: 'Funding & events',
    description:
      'Funding rounds, investors, milestones and incidents from DefiLlama — a batch of projects per run, stalest first.',
    everyMs: HOUR,
    after: ['projects'],
    run: syncFunding,
  },
  programs: {
    label: 'Solana programs',
    description:
      'Verified builds from OtterSec and swap venues from Jupiter, each mapped to the project that likely operates it — for review.',
    everyMs: 24 * HOUR,
    after: ['projects'],
    run: syncPrograms,
  },
  onchain: {
    label: 'On-chain program data',
    description:
      'Loader, upgrade authority, last deploy and estimated activity for each program, read from a Solana RPC node — a batch per run, mapped programs first.',
    everyMs: HOUR,
    after: ['programs'],
    run: syncOnchain,
  },
  people: {
    label: 'Code contributors',
    description:
      'Top GitHub contributors to each project’s repositories, as people for review — a batch of projects per run, within GitHub’s rate limit.',
    everyMs: HOUR,
    after: ['projects'],
    run: syncPeople,
  },
  news: {
    label: 'News',
    description:
      'Solana news from publishers’ feeds — headline, summary and link only — linked to the projects, investors and people it names.',
    everyMs: 30 * MINUTE,
    run: syncNews,
  },
  events: {
    label: 'Events & incidents',
    description:
      'Solana conferences and hackathons from solana.com, and security incidents from DefiLlama’s hacks database.',
    everyMs: 24 * HOUR,
    after: ['projects'],
    run: syncEvents,
  },
} satisfies Record<string, JobDefinition>;

export type JobName = keyof typeof registry | (string & {});

const jobs = new Map<string, JobDefinition>(Object.entries(registry));

/** Add a job to the schedule. Used by modules whose sources are optional. */
export function registerJob(name: string, definition: JobDefinition) {
  jobs.set(name, definition);
}

export function jobDefinitions(): [string, JobDefinition][] {
  return [...jobs.entries()];
}

export type ImportRun = typeof importRuns.$inferSelect;

/** A run still marked running after this long died with its process. */
const STALE_RUN_MS = 30 * MINUTE;

export interface RunOptions {
  readonly env: JobEnv;
  readonly signal?: AbortSignal;
  readonly log?: (message: string) => void;
  /** Who asked: `schedule`, or an editor's name. Recorded with the run. */
  readonly requestedBy?: string;
  /** Called after each job, so readers see a finished import without waiting for the rest. */
  readonly onJobDone?: (run: ImportRun) => void;
}

export async function runJob(db: Db, name: string, options: RunOptions): Promise<ImportRun | null> {
  const job = jobs.get(name);
  if (!job) throw new Error(`Unknown job ${name}`);
  const now = new Date();

  const [running] = await db
    .select()
    .from(importRuns)
    .where(and(eq(importRuns.job, name), eq(importRuns.status, 'running')))
    .orderBy(desc(importRuns.startedAt))
    .limit(1);
  if (running && now.getTime() - running.startedAt.getTime() < STALE_RUN_MS) return null;
  if (running) {
    await db
      .update(importRuns)
      .set({
        status: 'error',
        finishedAt: now,
        error: 'Interrupted: the process running it stopped.',
      })
      .where(eq(importRuns.id, running.id));
  }

  const [previous] = await db
    .select({ id: importRuns.id })
    .from(importRuns)
    .where(and(eq(importRuns.job, name), inArray(importRuns.status, ['ok', 'partial'])))
    .limit(1);

  const [run] = await db
    .insert(importRuns)
    .values({ job: name, status: 'running', startedAt: now })
    .returning();
  const log = options.log ?? (() => {});
  try {
    const result = await job.run({
      db,
      now,
      actor: `import:${name}`,
      bootstrap: !previous,
      signal: options.signal,
      env: options.env,
      log: (m) => log(`[${name}] ${m}`),
    });
    const [done] = await db
      .update(importRuns)
      .set({
        status: result.partial ? 'partial' : 'ok',
        finishedAt: new Date(),
        stats: result.stats,
      })
      .where(eq(importRuns.id, run!.id))
      .returning();
    log(
      `[${name}] ${done!.status} in ${((Date.now() - now.getTime()) / 1000).toFixed(1)}s ${JSON.stringify(result.stats)}`,
    );
    return done!;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const [failed] = await db
      .update(importRuns)
      .set({ status: 'error', finishedAt: new Date(), error: message.slice(0, 2000) })
      .where(eq(importRuns.id, run!.id))
      .returning();
    log(`[${name}] failed: ${message}`);
    return failed!;
  }
}

/**
 * Close out runs left marked running by a process that no longer exists.
 * Only safe where one process owns the database — the embedded one — so the
 * caller decides; with a shared Postgres, the staleness timeout does this.
 */
export async function closeInterruptedRuns(db: Db): Promise<number> {
  const closed = await db
    .update(importRuns)
    .set({
      status: 'error',
      finishedAt: new Date(),
      error: 'Interrupted: the server restarted while it ran.',
    })
    .where(eq(importRuns.status, 'running'))
    .returning({ id: importRuns.id });
  return closed.length;
}

export interface JobStatus {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly everyMs: number;
  readonly last: ImportRun | null;
  readonly lastOk: ImportRun | null;
  readonly due: boolean;
  readonly blockedBy: string[];
}

export async function jobStatuses(db: Db, now = Date.now()): Promise<JobStatus[]> {
  const latest = await db
    .execute(sql`select 1`)
    .then(() => db.select().from(importRuns).orderBy(desc(importRuns.startedAt)).limit(500));
  const out: JobStatus[] = [];
  for (const [name, job] of jobs) {
    const mine = latest.filter((r) => r.job === name);
    const last = mine[0] ?? null;
    const lastOk = mine.find((r) => r.status === 'ok' || r.status === 'partial') ?? null;
    const blockedBy = (job.after ?? []).filter(
      (dep) => !latest.some((r) => r.job === dep && (r.status === 'ok' || r.status === 'partial')),
    );
    const running = last?.status === 'running' && now - last.startedAt.getTime() < STALE_RUN_MS;
    // A failed run is retried after a fifth of the cadence, not a whole one.
    const reference = lastOk ?? null;
    const failedRecently =
      last?.status === 'error' &&
      now - last.startedAt.getTime() < Math.max(5 * MINUTE, job.everyMs / 5);
    const due =
      !running &&
      blockedBy.length === 0 &&
      !failedRecently &&
      (!reference || now - reference.startedAt.getTime() >= job.everyMs);
    out.push({
      name,
      label: job.label,
      description: job.description,
      everyMs: job.everyMs,
      last,
      lastOk,
      due,
      blockedBy,
    });
  }
  return out;
}

/** Run every due job, in schedule order, one at a time. */
export async function runDueJobs(db: Db, options: RunOptions): Promise<ImportRun[]> {
  const ran: ImportRun[] = [];
  // Re-evaluated after each run: a job's first success unblocks its dependants.
  for (let pass = 0; pass < jobs.size; pass += 1) {
    const next = (await jobStatuses(db)).find((s) => s.due && !ran.some((r) => r.job === s.name));
    if (!next || options.signal?.aborted) break;
    const run = await runJob(db, next.name, options);
    if (run) {
      ran.push(run);
      options.onJobDone?.(run);
    }
  }
  return ran;
}
