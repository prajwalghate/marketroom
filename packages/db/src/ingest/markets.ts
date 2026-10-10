/**
 * Token markets, from Jupiter.
 *
 * One snapshot per token per run: price, market cap, FDV, 24-hour volume,
 * liquidity and holders, labelled with the provider and the provider's own
 * update time. Snapshots are thinned as they age — every run for two days,
 * one an hour for six weeks — so history stays cheap to keep.
 */

import { SolanaMarkets } from '@marketroom/adapters';
import { ne, sql } from 'drizzle-orm';
import { marketSnapshots, tokens } from '../schema';
import { chunk, upsertEvidence, upsertSources, type EvidenceInput } from '../write';
import type { JobContext, JobResult } from './context';

const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const TOKEN_CLASSIC = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

export const jupiterTokenPage = (mint: string) => `https://jup.ag/tokens/${mint}`;

export async function syncMarkets(ctx: JobContext): Promise<JobResult> {
  const { db } = ctx;
  const all = await db
    .select({ id: tokens.id, mint: tokens.mint })
    .from(tokens)
    .where(ne(tokens.reviewStatus, 'rejected'));
  if (all.length === 0) return { stats: { tokens: 0 } };

  const markets = await new SolanaMarkets({ signal: ctx.signal }).byMints(all.map((t) => t.mint));
  const byMint = new Map(markets.map((m) => [m.mint!, m]));
  const idByMint = new Map(all.map((t) => [t.mint, t.id]));

  const snapshots = markets
    .filter((m) => m.mint && idByMint.has(m.mint))
    .map((m) => ({
      tokenId: idByMint.get(m.mint!)!,
      capturedAt: ctx.now,
      price: m.price,
      marketCap: m.marketCap,
      fdv: m.fdv,
      volume24h: m.volume24h,
      liquidity: m.liquidity,
      holders: m.holders === null ? null : Math.round(m.holders),
      change24h: m.change24h,
      provider: 'Jupiter',
      providerUpdatedAt: m.updatedAt === null ? null : new Date(m.updatedAt),
    }));
  for (const batch of chunk(snapshots, 300)) await db.insert(marketSnapshots).values(batch);

  // Fill in what the token record lacks; never overwrite what an editor set.
  for (const m of markets) {
    const id = m.mint ? idByMint.get(m.mint) : undefined;
    if (!id) continue;
    const standard =
      m.tokenProgram === TOKEN_2022
        ? 'token-2022'
        : m.tokenProgram === TOKEN_CLASSIC
          ? 'spl'
          : null;
    await db.execute(sql`
      update ${tokens} set
        symbol = case when 'symbol' = any(locked_fields) then symbol else coalesce(${m.symbol || null}, symbol) end,
        name = case when 'name' = any(locked_fields) then name else coalesce(${m.name || null}, name) end,
        logo_url = case when 'logoUrl' = any(locked_fields) then logo_url else coalesce(${m.image}, logo_url) end,
        decimals = coalesce(decimals, ${m.decimals}),
        standard = coalesce(standard, ${standard}),
        launched_at = coalesce(launched_at, ${m.createdAt === null ? null : new Date(m.createdAt)}),
        updated_at = now()
      where id = ${id}`);
  }

  const sourceIds = await upsertSources(
    db,
    markets.map((m) => ({
      url: jupiterTokenPage(m.mint!),
      title: `${m.symbol || m.mint} on Jupiter`,
      publisher: 'Jupiter',
      kind: 'database' as const,
    })),
  );
  const ev: EvidenceInput[] = [];
  for (const m of markets) {
    const id = idByMint.get(m.mint!);
    const sourceId = sourceIds.get(jupiterTokenPage(m.mint!));
    if (!id || !sourceId) continue;
    ev.push({
      subjectType: 'token',
      subjectId: id,
      field: 'symbol',
      sourceId,
      method: 'imported',
      checkedBy: ctx.actor,
    });
  }
  await upsertEvidence(db, ev);

  // Thin: keep every snapshot for two days, then the last one each hour, for six weeks.
  await db.execute(sql`
    delete from ${marketSnapshots} ms using (
      select id from (
        select id, row_number() over (
          partition by token_id, date_trunc('hour', captured_at) order by captured_at desc
        ) as rn
        from ${marketSnapshots} where captured_at < now() - interval '2 days'
      ) ranked where rn > 1
    ) old where ms.id = old.id`);
  await db.execute(
    sql`delete from ${marketSnapshots} where captured_at < now() - interval '42 days'`,
  );

  return {
    stats: { tokens: all.length, priced: snapshots.length, missing: all.length - byMint.size },
  };
}
