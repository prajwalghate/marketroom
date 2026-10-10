import 'server-only';

import path from 'node:path';
import {
  closeInterruptedRuns,
  migrate,
  openDb,
  runDueJobs,
  type Db,
  type DbHandle,
  type JobEnv,
} from '@marketroom/db';

/**
 * The research database, opened once per server process.
 *
 * With `DATABASE_URL`, a hosted Postgres; without it, an embedded PGlite
 * database under `.data/` — nothing to install for development. Held on
 * `globalThis` so hot reloads reuse the open database instead of opening the
 * same directory twice, which PGlite does not allow.
 *
 * Upkeep runs here too: each request may nudge the import schedule, which
 * runs whatever is due in the background, one job at a time. Production also
 * calls the schedule from a cron route (see /api/cron/upkeep), so data stays
 * fresh with or without traffic.
 */

const BUILDING = process.env.NEXT_PHASE === 'phase-production-build';

interface State {
  handle?: Promise<DbHandle>;
  upkeep?: Promise<unknown> | null;
  lastNudge?: number;
  cache?: Map<string, { at: number; value: Promise<unknown> }>;
}

const state: State = ((globalThis as { __marketroomDb?: State }).__marketroomDb ??= {});

function dataDir(): string {
  if (process.env.PGLITE_DIR) return path.resolve(process.env.PGLITE_DIR);
  // Serverless file systems are read-only outside /tmp, and /tmp is per instance.
  if (process.env.VERCEL) return '/tmp/marketroom-pglite';
  return path.resolve(process.cwd(), '.data', 'pglite');
}

export function databaseInfo() {
  const url = process.env.DATABASE_URL;
  return {
    driver: url ? ('postgres' as const) : ('pglite' as const),
    location: url ? safeHost(url) : dataDir(),
    /** Embedded storage on a serverless host is lost when the instance is recycled. */
    ephemeral: !url && !!process.env.VERCEL,
  };
}

const safeHost = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return 'postgres';
  }
};

export async function getDb(): Promise<Db> {
  if (BUILDING)
    throw new Error('The database is not opened during a build; render this page on request.');
  state.handle ??= (async () => {
    const handle = await openDb({ url: process.env.DATABASE_URL ?? null, dir: dataDir() });
    await migrate(handle.db);
    // The embedded database belongs to this process alone: any run still
    // marked running died with the process before it.
    if (handle.driver === 'pglite') await closeInterruptedRuns(handle.db);
    return handle;
  })().catch((error) => {
    state.handle = undefined;
    throw error;
  });
  return (await state.handle).db;
}

export const jobEnv = (): JobEnv => ({
  defillamaKey: process.env.DEFILLAMA_API_KEY ?? null,
  coingeckoKey: process.env.COINGECKO_API_KEY ?? null,
  githubToken: process.env.GITHUB_TOKEN ?? null,
  rpcUrl: process.env.SOLANA_RPC_URL ?? null,
});

/** At most one schedule check per process per this interval. */
const NUDGE_EVERY_MS = 60_000;

/**
 * Run whatever import jobs are due, in the background. Cheap to call on every
 * request: it checks at most once a minute and never runs two passes at once.
 * Set `MARKETROOM_UPKEEP=off` to leave scheduling to the cron route alone.
 */
export function nudgeUpkeep(): Promise<unknown> | null {
  if (BUILDING || process.env.MARKETROOM_UPKEEP === 'off') return null;
  const now = Date.now();
  if (state.upkeep) return state.upkeep;
  if (state.lastNudge && now - state.lastNudge < NUDGE_EVERY_MS) return null;
  state.lastNudge = now;
  state.upkeep = (async () => {
    const db = await getDb();
    const ran = await runDueJobs(db, {
      env: jobEnv(),
      log: (m) => console.warn(`[upkeep] ${m}`),
      requestedBy: 'schedule',
      onJobDone: () => clearReadCache(),
    });
    if (ran.length) clearReadCache();
    return ran;
  })()
    .catch((error) => console.error('[upkeep] failed', error))
    .finally(() => {
      state.upkeep = null;
    });
  return state.upkeep;
}

export const upkeepRunning = () => !!state.upkeep;

/**
 * A short-lived in-process cache for the heavier whole-table reads (the
 * directory, the investor list). Editors' writes and finished imports clear
 * it, so a correction shows on the next page load.
 */
export function cachedRead<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  state.cache ??= new Map();
  const hit = state.cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load().catch((error) => {
    state.cache?.delete(key);
    throw error;
  });
  state.cache.set(key, { at: Date.now(), value });
  return value;
}

export function clearReadCache() {
  state.cache?.clear();
}
