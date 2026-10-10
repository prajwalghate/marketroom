/**
 * Programs, as the chain describes them: which loader owns each, whether
 * anyone can still upgrade it and who, when it was last deployed — and how
 * busy it has been lately.
 *
 * Read from a Solana RPC node (`SOLANA_RPC_URL`, else a public one), a batch
 * per run: programs mapped to a project first, then whichever were read
 * longest ago. Every field is evidenced by the program's page on the Solana
 * Explorer, where a reader can check it.
 *
 * Activity is an estimate from the program's latest transaction signatures
 * (see `estimateActivity`), saved as a dated snapshot with a sentence saying
 * exactly how it was made. The public node keeps about a day of history: a
 * program that returns fewer signatures than were asked for has had no others
 * in that day, so its rate is measured over the whole day — and one with none
 * at all is asked about, once, on a node with the full history, to learn when
 * it last did anything.
 */

import {
  HISTORY_RPC,
  mapSettledLimit,
  PUBLIC_RPC,
  readPrograms,
  RpcError,
  SolanaRpc,
  HttpResponseError,
  type ProgramAccount,
  type SignatureInfo,
} from '@marketroom/adapters';
import { canonicalUrl, estimateActivity } from '@marketroom/core';
import { eq, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { rows } from '../client';
import { programActivity, programs, syncState } from '../schema';
import { chunk, upsertEvidence, upsertSources, type EvidenceInput } from '../write';
import type { JobContext, JobResult } from './context';

const JOB = 'onchain';
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Signatures asked for per program. Fewer back means the node holds no more. */
const SAMPLE = 1_000;
/** A program read this long ago is due again; until then, others go first. */
const REFRESH_MS = 6 * HOUR_MS;
/**
 * A node whose history starts within this window prunes: what it returns is
 * all it has. Beyond it (a full-history node), a short sample reaches the
 * program's first transaction, and the window starts there instead.
 */
const PRUNED_HISTORY_MS = 14 * DAY_MS;
/** Lookups on the full-history node per run, at one a second. */
const MAX_HISTORY_LOOKUPS = 25;
const KEEP_ACTIVITY_DAYS = 45;

export const explorerPage = (address: string) =>
  `https://explorer.solana.com/address/${encodeURIComponent(address)}`;

/**
 * The node a batch reads from. `SOLANA_RPC_URL` when it names a node of
 * one's own — but the public mainnet-beta endpoint, which `.env.example`
 * suggests for the occasional read elsewhere in the app, allows about one
 * signature lookup a second: fine for the few questions asked of it here,
 * hopeless for a batch. Then the generous public node reads the batch.
 */
export function primaryRpcUrl(configured: string | null | undefined): string {
  const url = configured?.trim();
  if (!url) return PUBLIC_RPC;
  try {
    return new URL(url).hostname === new URL(HISTORY_RPC).hostname ? PUBLIC_RPC : url;
  } catch {
    return PUBLIC_RPC;
  }
}

interface Due {
  id: number;
  address: string;
  locked_fields: string[];
}

/** Never-read and stale programs first, those mapped to a project ahead of the rest. */
async function duePrograms(ctx: JobContext, limit: number): Promise<Due[]> {
  const dueBefore = new Date(ctx.now.getTime() - REFRESH_MS).toISOString();
  return rows<Due>(
    ctx.db,
    sql`
      select p.id, p.address, p.locked_fields
      from ${programs} p
      left join ${syncState} s
        on s.job = ${JOB} and s.subject_type = 'program' and s.subject_id = p.id
      where p.review_status <> 'rejected'
      order by
        (s.synced_at is null or s.synced_at < ${dueBefore}::timestamptz) desc,
        exists (
          select 1 from project_programs pp
          where pp.program_id = p.id and pp.review_status <> 'rejected'
        ) desc,
        s.synced_at asc nulls first,
        p.id
      limit ${limit}`,
  );
}

const formatHours = (hours: number) =>
  hours < 48 ? `${hours.toFixed(1)} hours` : `${Math.round(hours / 24)} days`;

/**
 * How a rate was estimated, in a sentence a reader can check: which node,
 * how many signatures, and over what window. It must always read as an
 * estimate, because it is one.
 */
export function activityMethod(input: {
  readonly provider: string;
  readonly requested: number;
  readonly returned: number;
  /** Set when the sample holds all of the node's history: how many hours that is. */
  readonly historyHours: number | null;
  /** The full-history node asked when the program last did anything, and whether it knew. */
  readonly elsewhere?: { readonly host: string; readonly found: boolean } | null;
}): string {
  const n = input.returned.toLocaleString('en-US');
  if (input.returned >= input.requested) {
    return `Estimated from the ${n} most recent transaction signatures ${input.provider} returned: their count divided by the time from the oldest of them to now.`;
  }
  if (input.historyHours !== null) {
    const span = formatHours(input.historyHours);
    if (input.returned > 0) {
      return `Estimated from all ${n} transaction signatures in the ${span} of history ${input.provider} keeps, divided by those ${span}.`;
    }
    const latest = !input.elsewhere
      ? ''
      : input.elsewhere.found
        ? `; the time of the latest transaction was read from ${input.elsewhere.host}`
        : `; ${input.elsewhere.host} holds none for it either`;
    return `No transactions in the ${span} of history ${input.provider} keeps, so the estimated rate is zero${latest}.`;
  }
  if (input.returned === 0) {
    return `${input.provider} returned no transaction signatures, so no rate could be estimated.`;
  }
  return `Estimated from all ${n} transaction signatures ${input.provider} returned, divided by the time from the oldest of them to now.`;
}

export async function syncOnchain(ctx: JobContext): Promise<JobResult> {
  const { db } = ctx;
  const batch = await duePrograms(ctx, ctx.bootstrap ? 80 : 40);
  if (batch.length === 0) return { stats: { programs: 0 } };

  const primary = new SolanaRpc(primaryRpcUrl(ctx.env.rpcUrl), { signal: ctx.signal });
  const history =
    primary.host === new URL(HISTORY_RPC).hostname
      ? null
      : new SolanaRpc(HISTORY_RPC, { signal: ctx.signal, minIntervalMs: 1_100, retries: 0 });
  ctx.log(`Reading ${batch.length} programs from ${primary.host}`);
  // A configured node's URL can carry an API key; errors name the host instead.
  const redact = (error: unknown) =>
    (error instanceof Error ? error.message : String(error)).split(primary.url).join(primary.host);

  const accounts = await readPrograms(
    primary,
    batch.map((p) => p.address),
  ).catch((error: unknown) => {
    throw new Error(`Reading program accounts from ${primary.host} failed: ${redact(error)}`);
  });
  const historyStart = await primary.historyStart().catch((error: unknown) => {
    ctx.log(`Could not read where ${primary.host}'s history starts: ${redact(error)}`);
    return null;
  });
  const now = ctx.now.getTime();
  const pruned = historyStart !== null && now - historyStart < PRUNED_HISTORY_MS;

  // Each sample is measured to the moment it was taken, not to the start of
  // the run: a busy program's thousand signatures span a few seconds, and a
  // run takes longer than that.
  const sampled = await mapSettledLimit(batch, 4, async (p) => {
    const signatures = await primary.signatures(p.address, SAMPLE, { commitment: 'confirmed' });
    return { signatures, at: Date.now() };
  });

  // Silent on the pruning node: ask the full-history node when each last did anything.
  const latestElsewhere = new Map<number, number | null>();
  let lookups = 0;
  if (history && pruned) {
    for (const [i, p] of batch.entries()) {
      const result = sampled[i];
      if (result?.status !== 'fulfilled' || result.value.signatures.length > 0) continue;
      if (lookups >= MAX_HISTORY_LOOKUPS) break;
      lookups += 1;
      try {
        const [latest] = await history.signatures(p.address, 1, { commitment: 'confirmed' });
        latestElsewhere.set(p.id, latest?.blockTime ?? null);
      } catch (error) {
        // Still refused after waiting as told: the node's budget is spent for now.
        if (error instanceof HttpResponseError && error.status === 429) break;
        if (!(error instanceof RpcError)) ctx.log(`${HISTORY_RPC}: ${String(error)}`);
      }
    }
  }

  const sourceIds = await upsertSources(
    db,
    batch.map((p) => ({
      url: explorerPage(p.address),
      title: `${p.address} on Solana Explorer`,
      publisher: 'Solana Explorer',
      kind: 'onchain' as const,
    })),
  );

  const ev: EvidenceInput[] = [];
  const snapshots: (typeof programActivity.$inferInsert)[] = [];
  const stats = {
    programs: batch.length,
    accounts: 0,
    missing: 0,
    activity: 0,
    quiet: 0,
    historyLookups: lookups,
    failed: 0,
  };

  for (const [i, p] of batch.entries()) {
    const account = accounts.get(p.address);
    const result = sampled[i];
    if (account === undefined || result?.status !== 'fulfilled') {
      stats.failed += 1;
      await markSynced(ctx, p.id, false);
      continue;
    }

    await writeFacts(ctx, p, account);
    if (account) stats.accounts += 1;
    else stats.missing += 1;
    const sourceId = sourceIds.get(canonicalUrl(explorerPage(p.address)));
    if (sourceId) ev.push(...factEvidence(ctx, p, account, sourceId));

    const snapshot = activitySnapshot(p.id, result.value.signatures, {
      now: result.value.at,
      provider: primary.host,
      historyStart: pruned ? historyStart : null,
      latestElsewhere: latestElsewhere.has(p.id)
        ? { at: latestElsewhere.get(p.id) ?? null, host: history!.host }
        : null,
    });
    snapshots.push({ ...snapshot, capturedAt: ctx.now });
    if (result.value.signatures.length === 0) stats.quiet += 1;
    await markSynced(ctx, p.id, true);
  }

  for (const rowsBatch of chunk(snapshots, 200)) await db.insert(programActivity).values(rowsBatch);
  stats.activity = snapshots.length;
  await upsertEvidence(db, ev);

  const cutoff = new Date(now - KEEP_ACTIVITY_DAYS * DAY_MS).toISOString();
  await db.execute(sql`delete from ${programActivity} where captured_at < ${cutoff}::timestamptz`);

  return { stats, partial: stats.failed > 0 && stats.failed < batch.length };
}

/** Loader, authority, ProgramData and last deploy — each unless an editor has locked it. */
async function writeFacts(ctx: JobContext, p: Due, account: ProgramAccount | null) {
  // A program that is not on the chain: nothing about it can be read.
  const facts = account ?? {
    loader: 'unknown',
    programDataAddress: null,
    upgradeAuthority: null,
    lastDeploySlot: null,
  };
  const keep = (field: string, column: AnyPgColumn, value: unknown) =>
    sql`case when ${field} = any(${programs.lockedFields}) then ${column} else ${value} end`;
  await ctx.db
    .update(programs)
    .set({
      loader: keep('loader', programs.loader, facts.loader),
      programDataAddress: keep(
        'programDataAddress',
        programs.programDataAddress,
        facts.programDataAddress,
      ),
      upgradeAuthority: keep('upgradeAuthority', programs.upgradeAuthority, facts.upgradeAuthority),
      lastDeploySlot: keep('lastDeploySlot', programs.lastDeploySlot, facts.lastDeploySlot),
      onchainCheckedAt: ctx.now,
      updatedAt: ctx.now,
    })
    .where(eq(programs.id, p.id));
}

function factEvidence(
  ctx: JobContext,
  p: Due,
  account: ProgramAccount | null,
  sourceId: number,
): EvidenceInput[] {
  const locked = new Set(p.locked_fields ?? []);
  const base = {
    subjectType: 'program' as const,
    subjectId: p.id,
    sourceId,
    method: 'onchain' as const,
    checkedBy: ctx.actor,
  };
  const out: EvidenceInput[] = [];
  const add = (field: string, note: string | null = null) => {
    if (!locked.has(field)) out.push({ ...base, field, note });
  };
  if (!account) {
    add('loader', 'No program account exists at this address.');
    return out;
  }
  add(
    'loader',
    account.loader === 'unknown'
      ? `Owned by ${account.owner}, which is not a program loader.`
      : null,
  );
  add(
    'upgradeAuthority',
    account.upgradeAuthority
      ? null
      : account.loader === 'immutable'
        ? 'No upgrade authority: the program can no longer be changed.'
        : null,
  );
  if (account.programDataAddress) add('programDataAddress');
  if (account.lastDeploySlot !== null) add('lastDeploySlot');
  return out;
}

function activitySnapshot(
  programId: number,
  sample: readonly SignatureInfo[],
  context: {
    /** When the sample was taken, unix ms. */
    now: number;
    provider: string;
    /** Where a pruning node's history starts; `null` for a full-history node. */
    historyStart: number | null;
    latestElsewhere: { at: number | null; host: string } | null;
  },
): Omit<typeof programActivity.$inferInsert, 'capturedAt'> {
  const complete = context.historyStart !== null && sample.length < SAMPLE;
  // Block times can run a second or two ahead of this machine's clock; "now"
  // is never earlier than the newest transaction the node has seen.
  const newest = Math.max(0, ...sample.map((s) => (s.blockTime ?? 0) * 1000));
  const now = Math.max(context.now, newest);
  const estimate = estimateActivity(
    sample.map((s) => ({ blockTime: s.blockTime, failed: s.failed })),
    now,
    complete ? { completeSince: context.historyStart } : {},
  );
  const fromElsewhere = sample.length === 0 && context.latestElsewhere !== null;
  const latestTxAt = fromElsewhere
    ? context.latestElsewhere!.at === null
      ? null
      : context.latestElsewhere!.at * 1000
    : estimate.latestTxAt;
  return {
    programId,
    sampleSize: estimate.sampleSize,
    windowSeconds: estimate.windowSeconds,
    txPerHour: estimate.txPerHour,
    failedShare: estimate.failedShare,
    latestTxAt: latestTxAt === null ? null : new Date(latestTxAt),
    provider: context.provider,
    method: activityMethod({
      provider: context.provider,
      requested: SAMPLE,
      returned: sample.length,
      historyHours: complete ? (now - context.historyStart!) / HOUR_MS : null,
      elsewhere: fromElsewhere
        ? { host: context.latestElsewhere!.host, found: context.latestElsewhere!.at !== null }
        : null,
    }),
  };
}

async function markSynced(ctx: JobContext, programId: number, ok: boolean) {
  await ctx.db
    .insert(syncState)
    .values({ job: JOB, subjectType: 'program', subjectId: programId, syncedAt: ctx.now, ok })
    .onConflictDoUpdate({
      target: [syncState.job, syncState.subjectType, syncState.subjectId],
      set: { syncedAt: ctx.now, ok },
    });
}
