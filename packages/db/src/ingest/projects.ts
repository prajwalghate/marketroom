/**
 * Projects, from DefiLlama.
 *
 * DefiLlama is the broadest free registry of Solana projects: name, category,
 * description, links, token mint, and value locked. A project here is a team —
 * product lines DefiLlama lists separately are rolled up into one record (see
 * `DefiLlamaSolana.projects`), and the product split is kept in the metrics
 * snapshot.
 *
 * Every field this writes is evidenced by the project's DefiLlama page, and
 * skipped if an editor has locked it.
 */

import { DefiLlamaSolana } from '@marketroom/adapters';
import { normalizeName, toSlug, uniqueSlug, type FlowTotals, type Project } from '@marketroom/core';
import { eq, inArray, sql } from 'drizzle-orm';
import { projectMetrics, projects, tokens, type ProjectStatus } from '../schema';
import {
  addAliases,
  aliasIndex,
  chunk,
  recordChanges,
  unlockedSet,
  upsertEvidence,
  upsertSources,
  type ChangeInput,
  type EvidenceInput,
} from '../write';
import { firstSentence, type JobContext, type JobResult } from './context';

const PROJECT_FIELDS = [
  'name',
  'tagline',
  'description',
  'logoUrl',
  'category',
  'tags',
  'status',
  'website',
  'twitter',
  'githubOrgs',
  'coingeckoId',
  'defillamaIds',
  'defillamaSlugs',
] as const;

export const defillamaPage = (key: string) =>
  `https://defillama.com/protocol/${encodeURIComponent(key)}`;

/**
 * Status is inferred only from what DefiLlama measures, and recorded as an
 * inference. A project DefiLlama does not measure stays `null` — unknown —
 * rather than being called active.
 */
export function inferStatus(tvl: number | null, fees30d: number | null): ProjectStatus | null {
  if (tvl !== null && tvl >= 10_000) return 'active';
  if (fees30d !== null && fees30d >= 1_000) return 'active';
  if (tvl !== null && tvl < 1_000 && !(fees30d && fees30d > 0)) return 'inactive';
  return null;
}

function sumFor(flows: FlowTotals | null, slugs: readonly string[]): number | null {
  if (!flows) return null;
  const set = new Set(slugs);
  const values = flows.entries.filter((e) => set.has(e.slug)).map((e) => e.total30d);
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

export async function syncProjects(ctx: JobContext): Promise<JobResult> {
  const { db } = ctx;
  const llama = new DefiLlamaSolana({ signal: ctx.signal });
  const [list, fees, revenue] = await Promise.all([
    llama.projects(),
    llama.flows('fees').catch(() => null),
    llama.flows('revenue').catch(() => null),
  ]);
  ctx.log(`DefiLlama lists ${list.length} Solana projects`);

  const existing = await db
    .select({ id: projects.id, slug: projects.slug, key: projects.defillamaKey })
    .from(projects);
  const byKey = new Map(existing.filter((e) => e.key).map((e) => [e.key!, e]));
  const taken = new Set(existing.map((e) => e.slug));

  // A project an editor created before the importer knew it: same name, no
  // DefiLlama key yet. Adopt it instead of creating a second one.
  const names = await aliasIndex(db, 'project');
  const unkeyed = new Set(existing.filter((e) => !e.key).map((e) => e.id));
  for (const p of list) {
    if (byKey.has(p.slug)) continue;
    const id = names.get(normalizeName(p.name));
    if (id && unkeyed.has(id)) {
      await db.update(projects).set({ defillamaKey: p.slug }).where(eq(projects.id, id));
      const row = existing.find((e) => e.id === id)!;
      byKey.set(p.slug, { ...row, key: p.slug });
      unkeyed.delete(id);
    }
  }

  let created = 0;
  const changes: ChangeInput[] = [];
  const idByKey = new Map<string, number>();
  const metricsFor = new Map<string, { fees30d: number | null; revenue30d: number | null }>();

  for (const batch of chunk(list, 100)) {
    const values = batch.map((p) => {
      const fees30d = sumFor(fees, p.sourceSlugs);
      const revenue30d = sumFor(revenue, p.sourceSlugs);
      metricsFor.set(p.slug, { fees30d, revenue30d });
      const known = byKey.get(p.slug);
      let slug = known?.slug;
      if (!slug) {
        slug = uniqueSlug(toSlug(p.name), (s) => taken.has(s));
        taken.add(slug);
      }
      return {
        slug,
        name: p.name,
        tagline: firstSentence(p.description),
        description: p.description,
        logoUrl: p.logo,
        category: p.category,
        tags: [...p.tags],
        status: inferStatus(p.tvlSolana, fees30d),
        website: p.links.website,
        twitter: p.links.twitter,
        githubOrgs: [...p.links.github],
        coingeckoId: p.geckoId,
        defillamaKey: p.slug,
        defillamaIds: [...p.sourceIds],
        defillamaSlugs: [...p.sourceSlugs],
      };
    });
    const saved = await db
      .insert(projects)
      .values(values)
      .onConflictDoUpdate({
        target: projects.defillamaKey,
        set: {
          ...unlockedSet(projects, projects as never, PROJECT_FIELDS),
          updatedAt: sql`now()`,
        },
        // A project an editor rejected or merged stays that way.
        setWhere: sql`${projects.reviewStatus} <> 'rejected' and ${projects.mergedIntoId} is null`,
      })
      .returning({
        id: projects.id,
        key: projects.defillamaKey,
        slug: projects.slug,
        name: projects.name,
      });
    for (const s of saved) {
      idByKey.set(s.key!, s.id);
      if (!byKey.has(s.key!)) {
        created += 1;
        if (!ctx.bootstrap) {
          changes.push({
            actor: ctx.actor,
            action: 'project.added',
            subjectType: 'project',
            subjectId: s.id,
            summary: `Added ${s.name}`,
          });
        }
      }
    }
  }
  // Rows skipped by `setWhere` are not returned; they keep their old ids.
  for (const e of existing) if (e.key && !idByKey.has(e.key)) idByKey.set(e.key, e.id);

  // Evidence: each project's DefiLlama page backs what was imported from it.
  const sourceIds = await upsertSources(
    db,
    list.map((p) => ({
      url: defillamaPage(p.slug),
      title: `${p.name} on DefiLlama`,
      publisher: 'DefiLlama',
      kind: 'database' as const,
    })),
  );
  const ev: EvidenceInput[] = [];
  for (const p of list) {
    const id = idByKey.get(p.slug);
    const sourceId = sourceIds.get(defillamaPage(p.slug));
    if (!id || !sourceId) continue;
    const base = { subjectType: 'project' as const, subjectId: id, sourceId, checkedBy: ctx.actor };
    ev.push({ ...base, method: 'imported' });
    if (p.description) ev.push({ ...base, field: 'description', method: 'imported' });
    if (p.category) ev.push({ ...base, field: 'category', method: 'imported' });
    if (p.links.website) ev.push({ ...base, field: 'website', method: 'imported' });
    if (p.links.twitter) ev.push({ ...base, field: 'twitter', method: 'imported' });
    const m = metricsFor.get(p.slug);
    if (inferStatus(p.tvlSolana, m?.fees30d ?? null)) {
      ev.push({
        ...base,
        field: 'status',
        method: 'inferred',
        note: 'Inferred from value locked and fees reported by DefiLlama.',
      });
    }
  }
  await upsertEvidence(db, ev);
  await addAliases(
    db,
    'project',
    list.flatMap((p) =>
      idByKey.get(p.slug) ? [{ subjectId: idByKey.get(p.slug)!, name: p.name }] : [],
    ),
  );

  // Value locked, fees and revenue, as of now.
  for (const batch of chunk(list, 200)) {
    const snapshot = batch
      .filter((p) => idByKey.has(p.slug))
      .map((p) => ({
        projectId: idByKey.get(p.slug)!,
        capturedAt: ctx.now,
        tvlSolana: p.tvlSolana,
        tvlTotal: p.tvlTotal,
        tvlChange1d: p.tvlChange1d,
        tvlChange7d: p.tvlChange7d,
        fees30d: metricsFor.get(p.slug)?.fees30d ?? null,
        revenue30d: metricsFor.get(p.slug)?.revenue30d ?? null,
        products: p.products.map((x) => ({ name: x.name, category: x.category, tvl: x.tvlSolana })),
        provider: 'DefiLlama',
      }));
    if (snapshot.length) await db.insert(projectMetrics).values(snapshot);
  }
  await db.execute(
    sql`delete from ${projectMetrics} where ${projectMetrics.capturedAt} < now() - interval '120 days'`,
  );

  const tokenStats = await syncProjectTokens(ctx, list, idByKey, sourceIds);
  await recordChanges(db, changes);
  return { stats: { projects: list.length, created, ...tokenStats } };
}

/** The token DefiLlama lists for each project, by mint. */
async function syncProjectTokens(
  ctx: JobContext,
  list: readonly Project[],
  idByKey: ReadonlyMap<string, number>,
  sourceIds: ReadonlyMap<string, number>,
): Promise<Record<string, number>> {
  const { db } = ctx;
  const withMint = list.filter((p) => p.tokenMint && idByKey.has(p.slug));
  if (withMint.length === 0) return { tokens: 0 };
  const mints = [...new Set(withMint.map((p) => p.tokenMint!))];
  const known = new Set(
    (await db.select({ mint: tokens.mint }).from(tokens).where(inArray(tokens.mint, mints))).map(
      (t) => t.mint,
    ),
  );
  const seen = new Set<string>();
  const values = withMint
    .filter((p) => (seen.has(p.tokenMint!) ? false : (seen.add(p.tokenMint!), true)))
    .map((p) => ({
      mint: p.tokenMint!,
      projectId: idByKey.get(p.slug)!,
      symbol: p.symbol,
      coingeckoId: p.geckoId,
      isPrimary: true,
    }));
  const saved: { id: number; mint: string }[] = [];
  for (const batch of chunk(values, 200)) {
    saved.push(
      ...(await db
        .insert(tokens)
        .values(batch)
        .onConflictDoUpdate({
          target: tokens.mint,
          set: {
            ...unlockedSet(tokens, tokens as never, ['projectId', 'coingeckoId']),
            symbol: sql`coalesce(${tokens.symbol}, excluded.symbol)`,
            updatedAt: sql`now()`,
          },
          setWhere: sql`${tokens.reviewStatus} <> 'rejected'`,
        })
        .returning({ id: tokens.id, mint: tokens.mint })),
    );
  }
  const projectByMint = new Map(withMint.map((p) => [p.tokenMint!, p.slug]));
  await upsertEvidence(
    db,
    saved.flatMap((t) => {
      const sourceId = sourceIds.get(defillamaPage(projectByMint.get(t.mint)!));
      return sourceId
        ? [
            {
              subjectType: 'token' as const,
              subjectId: t.id,
              field: 'projectId',
              sourceId,
              method: 'imported' as const,
              checkedBy: ctx.actor,
              note: 'DefiLlama lists this mint as the project’s token.',
            },
          ]
        : [];
    }),
  );
  // A project's first token is its primary one; never demote one an editor chose.
  await db.execute(sql`
    update ${tokens} t set is_primary = false
    where t.is_primary and exists (
      select 1 from ${tokens} o
      where o.project_id = t.project_id and o.is_primary and o.id < t.id
    ) and not ('isPrimary' = any(t.locked_fields))`);
  return { tokens: saved.length, tokensCreated: saved.filter((t) => !known.has(t.mint)).length };
}
