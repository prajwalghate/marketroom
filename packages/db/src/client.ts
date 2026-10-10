/**
 * Opening the database.
 *
 * Two drivers, one schema:
 *
 *  - With `DATABASE_URL`, a real Postgres (Neon, Supabase, RDS, local) over
 *    postgres.js — what production runs on.
 *  - Without it, PGlite: Postgres compiled to WebAssembly, persisted to a
 *    directory. Nothing to install or run, which is what a fresh checkout
 *    needs. It is one connection in one process, so the web server owns it;
 *    scripts reach it through the server rather than opening it themselves.
 *
 * Both are Postgres, so every query, constraint and migration is the same.
 */

import { sql, type SQL } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { MIGRATIONS } from './migrations';
import * as schema from './schema';

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
/** A database or an open transaction — anything queries can run on. */
export type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export interface DbHandle {
  readonly db: Db;
  readonly driver: 'pglite' | 'postgres';
  /** Where the data lives, for the admin dashboard: a directory, or the host. */
  readonly location: string;
  close(): Promise<void>;
}

export interface OpenOptions {
  /** A Postgres connection string. Takes precedence over `dir`. */
  readonly url?: string | null;
  /** PGlite data directory; omitted means in-memory (tests). */
  readonly dir?: string | null;
}

export async function openDb(options: OpenOptions = {}): Promise<DbHandle> {
  if (options.url) {
    const { default: postgres } = await import('postgres');
    const { drizzle } = await import('drizzle-orm/postgres-js');
    // `prepare: false` keeps transaction-mode poolers (Neon, PgBouncer) happy.
    const client = postgres(options.url, { max: 5, prepare: false, onnotice: () => {} });
    const db = drizzle(client, { schema }) as unknown as Db;
    isoDateParameters(client.options.serializers as Serializers);
    let host = 'postgres';
    try {
      host = new URL(options.url).hostname;
    } catch {
      // Keep the generic label.
    }
    return { db, driver: 'postgres', location: host, close: () => client.end() };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  if (options.dir && !/^[a-z]+:\/\//.test(options.dir)) {
    // PGlite creates its own directory but not the ones above it.
    const { mkdir } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    await mkdir(dirname(options.dir), { recursive: true });
  }
  const client = options.dir ? await PGlite.create(options.dir) : await PGlite.create();
  const slowMs = Number(process.env.MARKETROOM_SLOW_QUERY_MS) || 0;
  if (slowMs > 0) {
    // Embedded Postgres runs on the caller's thread: a slow query stalls
    // everything else. Opt-in timing to find which.
    const query = client.query.bind(client);
    client.query = (async (text: string, params?: unknown[], opts?: unknown) => {
      const t0 = performance.now();
      try {
        return await query(text, params as never, opts as never);
      } finally {
        const ms = performance.now() - t0;
        if (ms > slowMs)
          console.warn(
            `[slow query ${Math.round(ms)} ms] ${text.replace(/\s+/g, ' ').slice(0, 300)}`,
          );
      }
    }) as typeof client.query;
  }
  const db = drizzle(client, { schema }) as unknown as Db;
  return {
    db,
    driver: 'pglite',
    location: options.dir ?? 'memory',
    close: () => client.close(),
  };
}

type Serializers = Record<number, (value: unknown) => unknown>;

/**
 * Send JavaScript dates to postgres.js as ISO 8601.
 *
 * Drizzle replaces postgres.js's timestamp serializers with pass-throughs,
 * expecting its column mappers to have made strings already. A `Date` inside
 * a raw `sql` template never meets a mapper, so it reached Postgres as
 * `Date.toString()` — "Mon Jul 15 2024 13:32:46 GMT+0530 (India Standard
 * Time)" — which Postgres rejects. PGlite serializes dates itself, which is
 * why this only showed against a hosted database.
 */
export function isoDateParameters(serializers: Serializers): void {
  const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value);
  // date, timestamp, timestamptz — postgres.js tags every Date as timestamptz.
  for (const type of [1082, 1114, 1184]) serializers[type] = iso;
}

/** Rows from a raw query, whichever driver ran it. */
export async function rows<T>(db: Executor, query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown;
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

/**
 * Apply every migration not yet applied, in order, each in its own
 * transaction. An advisory lock keeps two server instances starting at once
 * from both applying the same migration.
 */
export async function migrate(db: Db): Promise<string[]> {
  await db.execute(
    sql`create table if not exists _migrations (tag text primary key, applied_at timestamptz not null default now())`,
  );
  const applied: string[] = [];
  for (const migration of MIGRATIONS) {
    const done = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(7271999)`);
      const existing = await rows<{ tag: string }>(
        tx,
        sql`select tag from _migrations where tag = ${migration.tag}`,
      );
      if (existing.length) return false;
      for (const statement of migration.statements) await tx.execute(sql.raw(statement));
      await tx.execute(sql`insert into _migrations (tag) values (${migration.tag})`);
      return true;
    });
    if (done) applied.push(migration.tag);
  }
  return applied;
}
