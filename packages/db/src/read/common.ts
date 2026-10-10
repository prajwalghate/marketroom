/**
 * Shared read helpers.
 *
 * Raw SQL reads normalise their own types so both drivers return the same
 * shapes: timestamps as epoch milliseconds (`float8`), dates as ISO strings
 * (`text`), counts as `int`. Nothing above this layer sees a driver-specific
 * value.
 */

import { sql, type SQL } from 'drizzle-orm';
import { rows, type Executor } from '../client';
import type {
  EvidenceMethod,
  ReviewStatus,
  SourceKind,
  SourceReview,
  SubjectType,
} from '../schema';

/** `(a, b, c)` for an `in` clause. Callers guard against empty lists. */
export const inList = (values: readonly (number | string)[]): SQL =>
  sql`(${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )})`;

/** Epoch milliseconds from a timestamp expression, or null. */
export const epoch = (expr: SQL | string): SQL =>
  typeof expr === 'string'
    ? sql.raw(`(extract(epoch from ${expr}) * 1000)::float8`)
    : sql`(extract(epoch from ${expr}) * 1000)::float8`;

/** A record that is neither merged away nor rejected. */
export const LIVE = (alias: string) =>
  sql.raw(`${alias}.merged_into_id is null and ${alias}.review_status <> 'rejected'`);

export interface Curation {
  readonly reviewStatus: ReviewStatus;
  readonly checkedAt: number | null;
  readonly checkedBy: string | null;
}

export interface EvidenceRef {
  /** The evidence row itself, for editors confirming or removing it. */
  readonly id: number;
  readonly sourceId: number;
  readonly url: string;
  readonly title: string | null;
  readonly publisher: string | null;
  readonly kind: SourceKind;
  readonly sourceReview: SourceReview;
  readonly method: EvidenceMethod;
  readonly field: string;
  readonly checkedAt: number;
  readonly checkedBy: string;
  readonly note: string | null;
}

/** Strongest evidence first: an editor's, then primary sources, then databases. */
const KIND_RANK: Record<string, number> = {
  filing: 0,
  announcement: 1,
  press: 2,
  social: 3,
  repository: 4,
  registry: 4,
  onchain: 4,
  website: 5,
  database: 6,
  api: 7,
};

export function rankEvidence(a: EvidenceRef, b: EvidenceRef): number {
  const editor = Number(b.method === 'editor') - Number(a.method === 'editor');
  if (editor) return editor;
  const kind = (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9);
  return kind || b.checkedAt - a.checkedAt;
}

const key = (type: SubjectType, id: number) => `${type}:${id}`;

/** Evidence for many subjects at once, keyed `type:id`, strongest first. */
export async function evidenceFor(
  db: Executor,
  subjects: readonly { type: SubjectType; ids: readonly number[] }[],
): Promise<Map<string, EvidenceRef[]>> {
  const clauses = subjects
    .filter((s) => s.ids.length > 0)
    .map(
      (s) => sql`(e.subject_type = ${s.type} and e.subject_id in ${inList([...new Set(s.ids)])})`,
    );
  const out = new Map<string, EvidenceRef[]>();
  if (clauses.length === 0) return out;
  const found = await rows<{
    id: number;
    subject_type: SubjectType;
    subject_id: number;
    field: string;
    method: EvidenceMethod;
    checked_at: number;
    checked_by: string;
    note: string | null;
    source_id: number;
    url: string;
    title: string | null;
    publisher: string | null;
    kind: SourceKind;
    review_status: SourceReview;
  }>(
    db,
    sql`select e.id, e.subject_type, e.subject_id, e.field, e.method, ${epoch('e.checked_at')} as checked_at,
          e.checked_by, e.note, s.id as source_id, s.url, s.title, s.publisher, s.kind, s.review_status
        from evidence e join sources s on s.id = e.source_id
        where ${sql.join(clauses, sql` or `)}`,
  );
  for (const r of found) {
    const k = key(r.subject_type, r.subject_id);
    const list = out.get(k) ?? [];
    list.push({
      id: r.id,
      sourceId: r.source_id,
      url: r.url,
      title: r.title,
      publisher: r.publisher,
      kind: r.kind,
      sourceReview: r.review_status,
      method: r.method,
      field: r.field,
      checkedAt: r.checked_at,
      checkedBy: r.checked_by,
      note: r.note,
    });
    out.set(k, list);
  }
  for (const list of out.values()) list.sort(rankEvidence);
  return out;
}

export const evidenceOf = (map: Map<string, EvidenceRef[]>, type: SubjectType, id: number) =>
  map.get(key(type, id)) ?? [];

/** Evidence for one field, falling back to the record's own when the field has none. */
export function forField(list: readonly EvidenceRef[], field: string): EvidenceRef[] {
  const exact = list.filter((e) => e.field === field);
  return exact.length ? exact : list.filter((e) => e.field === '');
}

export interface ProjectRef {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly logoUrl: string | null;
  readonly category: string | null;
}

export interface PersonRef {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly headline: string | null;
}

export interface OrgRef {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly logoUrl: string | null;
  readonly kind: string | null;
}

/** An investor in a round: an organisation or a person. */
export interface PartyRef {
  readonly type: 'organization' | 'person';
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly imageUrl: string | null;
}

export const partyHref = (p: Pick<PartyRef, 'type' | 'slug'>) =>
  p.type === 'person' ? `/people/${p.slug}` : `/investors/${p.slug}`;
