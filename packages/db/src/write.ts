/**
 * Write primitives shared by importers and editors.
 *
 * Everything that records *why* — sources, evidence, aliases, the change log —
 * goes through here, so the rules hold in one place: links are canonicalised
 * before they are stored, a funding round can never be evidenced by an
 * on-chain source, and an editor's evidence is never overwritten by an import.
 */

import {
  canonicalUrl,
  classifySource,
  normalizeName,
  type SourceKindGuess,
} from '@marketroom/core';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { rows, type Executor } from './client';
import {
  aliases,
  changes,
  evidence,
  FUNDING_SOURCE_KINDS,
  sources,
  type EvidenceMethod,
  type SourceKind,
  type SubjectType,
} from './schema';

export const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export interface SourceInput {
  readonly url: string;
  readonly title?: string | null;
  readonly publisher?: string | null;
  /** Classified from the domain when omitted. */
  readonly kind?: SourceKind | SourceKindGuess;
  readonly publishedAt?: Date | null;
}

/** Store sources, returning each one's id keyed by its canonical URL. */
export async function upsertSources(
  db: Executor,
  inputs: readonly SourceInput[],
): Promise<Map<string, number>> {
  const byUrl = new Map<string, typeof sources.$inferInsert>();
  for (const input of inputs) {
    if (!/^https?:\/\//i.test(input.url.trim())) continue;
    const url = canonicalUrl(input.url);
    const guess = classifySource(url);
    const existing = byUrl.get(url);
    byUrl.set(url, {
      url,
      title: input.title ?? existing?.title ?? null,
      publisher: input.publisher ?? existing?.publisher ?? guess.publisher,
      kind: (input.kind ?? existing?.kind ?? guess.kind) as SourceKind,
      publishedAt: input.publishedAt ?? existing?.publishedAt ?? null,
    });
  }
  const ids = new Map<string, number>();
  for (const batch of chunk([...byUrl.values()], 200)) {
    const saved = await db
      .insert(sources)
      .values(batch)
      .onConflictDoUpdate({
        target: sources.url,
        set: {
          title: sql`coalesce(${sources.title}, excluded.title)`,
          publisher: sql`coalesce(${sources.publisher}, excluded.publisher)`,
          publishedAt: sql`coalesce(${sources.publishedAt}, excluded.published_at)`,
        },
      })
      .returning({ id: sources.id, url: sources.url });
    for (const s of saved) ids.set(s.url, s.id);
  }
  return ids;
}

export async function sourceId(db: Executor, input: SourceInput): Promise<number | null> {
  const ids = await upsertSources(db, [input]);
  return ids.get(canonicalUrl(input.url)) ?? null;
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export interface EvidenceInput {
  readonly subjectType: SubjectType;
  readonly subjectId: number;
  /** Empty for the record or relationship as a whole. */
  readonly field?: string;
  readonly sourceId: number;
  readonly method: EvidenceMethod;
  readonly checkedBy: string;
  readonly checkedAt?: Date;
  readonly note?: string | null;
}

export class EvidenceRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceRuleError';
  }
}

/**
 * Attach evidence. Re-attaching the same source refreshes its checked date —
 * unless an editor attached it, in which case the editor's record stands.
 *
 * Refuses on-chain sources as evidence for a funding round: a wallet sending
 * SOL is not an announcement that a company raised money.
 */
export async function upsertEvidence(
  db: Executor,
  inputs: readonly EvidenceInput[],
): Promise<void> {
  if (inputs.length === 0) return;
  const roundSourceIds = [
    ...new Set(
      inputs
        .filter((i) => i.subjectType === 'round' || i.subjectType === 'round_investor')
        .map((i) => i.sourceId),
    ),
  ];
  if (roundSourceIds.length) {
    const kinds = await db
      .select({ id: sources.id, kind: sources.kind })
      .from(sources)
      .where(inArray(sources.id, roundSourceIds));
    const bad = kinds.find((k) => !FUNDING_SOURCE_KINDS.includes(k.kind));
    if (bad) {
      throw new EvidenceRuleError(
        `A ${bad.kind} source cannot evidence a funding round. Funding needs an announcement, press, a filing or a funding database.`,
      );
    }
  }

  const unique = new Map<string, EvidenceInput>();
  for (const i of inputs)
    unique.set(`${i.subjectType}:${i.subjectId}:${i.field ?? ''}:${i.sourceId}`, i);
  const now = new Date();
  for (const batch of chunk([...unique.values()], 300)) {
    await db
      .insert(evidence)
      .values(
        batch.map((i) => ({
          subjectType: i.subjectType,
          subjectId: i.subjectId,
          field: i.field ?? '',
          sourceId: i.sourceId,
          method: i.method,
          checkedBy: i.checkedBy,
          checkedAt: i.checkedAt ?? now,
          note: i.note ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: [evidence.subjectType, evidence.subjectId, evidence.field, evidence.sourceId],
        set: {
          checkedAt: sql`case when ${evidence.method} = 'editor' then ${evidence.checkedAt} else excluded.checked_at end`,
          checkedBy: sql`case when ${evidence.method} = 'editor' then ${evidence.checkedBy} else excluded.checked_by end`,
          method: sql`case when ${evidence.method} = 'editor' then ${evidence.method} else excluded.method end`,
          note: sql`coalesce(excluded.note, ${evidence.note})`,
        },
      });
  }
}

// ---------------------------------------------------------------------------
// Aliases
// ---------------------------------------------------------------------------

export async function addAliases(
  db: Executor,
  subjectType: SubjectType,
  items: readonly { subjectId: number; name: string }[],
): Promise<void> {
  const values = new Map<string, { subjectType: SubjectType; subjectId: number; alias: string }>();
  for (const item of items) {
    const alias = normalizeName(item.name);
    if (alias && !values.has(alias))
      values.set(alias, { subjectType, subjectId: item.subjectId, alias });
  }
  for (const batch of chunk([...values.values()], 300)) {
    await db.insert(aliases).values(batch).onConflictDoNothing();
  }
}

/** Every alias of one subject type, as normalised name → id. */
export async function aliasIndex(
  db: Executor,
  subjectType: SubjectType,
): Promise<Map<string, number>> {
  const all = await db
    .select({ alias: aliases.alias, subjectId: aliases.subjectId })
    .from(aliases)
    .where(eq(aliases.subjectType, subjectType));
  return new Map(all.map((a) => [a.alias, a.subjectId]));
}

export async function resolveAlias(
  db: Executor,
  subjectType: SubjectType,
  name: string,
): Promise<number | null> {
  const [hit] = await db
    .select({ subjectId: aliases.subjectId })
    .from(aliases)
    .where(and(eq(aliases.subjectType, subjectType), eq(aliases.alias, normalizeName(name))))
    .limit(1);
  return hit?.subjectId ?? null;
}

// ---------------------------------------------------------------------------
// Change log
// ---------------------------------------------------------------------------

export interface ChangeInput {
  readonly actor: string;
  readonly action: string;
  readonly subjectType?: SubjectType | null;
  readonly subjectId?: number | null;
  readonly summary: string;
  readonly diff?: Record<string, { from: unknown; to: unknown }> | null;
}

export async function recordChanges(db: Executor, items: readonly ChangeInput[]): Promise<void> {
  for (const batch of chunk(items, 300)) {
    if (batch.length === 0) continue;
    await db.insert(changes).values(
      batch.map((c) => ({
        actor: c.actor,
        action: c.action,
        subjectType: c.subjectType ?? null,
        subjectId: c.subjectId ?? null,
        summary: c.summary,
        diff: c.diff ?? null,
      })),
    );
  }
}

export const recordChange = (db: Executor, item: ChangeInput) => recordChanges(db, [item]);

// ---------------------------------------------------------------------------
// Field locks
// ---------------------------------------------------------------------------

/**
 * `set` clause values for an import upsert that leaves editor-locked fields
 * alone: each column becomes "keep the current value if locked, else take the
 * incoming one".
 */
export function unlockedSet(
  table: { lockedFields: unknown },
  columns: Record<string, { name: string }>,
  fields: readonly string[],
): Record<string, ReturnType<typeof sql>> {
  const set: Record<string, ReturnType<typeof sql>> = {};
  for (const field of fields) {
    const column = columns[field];
    if (!column) throw new Error(`Unknown column ${field}`);
    set[field] =
      sql`case when ${field} = any(${table.lockedFields}) then ${column} else ${sql.raw(`excluded."${column.name}"`)} end`;
  }
  return set;
}

/** Slugs already used in a table, for choosing new ones. */
export async function takenSlugs(
  db: Executor,
  table: 'projects' | 'people' | 'organizations' | 'funding_rounds' | 'events',
): Promise<Set<string>> {
  const found = await rows<{ slug: string }>(db, sql`select slug from ${sql.identifier(table)}`);
  return new Set(found.map((r) => r.slug));
}
