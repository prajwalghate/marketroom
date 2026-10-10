/**
 * What editors can do: correct a record, create one, confirm or reject it,
 * connect records, attach evidence, merge duplicates, review sources.
 *
 * Every operation runs in a transaction and writes the change log with the
 * editor's name and a field-by-field diff. A field an editor sets is locked
 * against imports. Editor-entered facts carry evidence with method `editor`,
 * which an import never overwrites.
 */

import { canonicalUrl, normalizeName, toSlug, uniqueSlug } from '@marketroom/core';
import { and, eq, sql } from 'drizzle-orm';
import { rows, type Db, type Executor } from './client';
import {
  distinctPairs,
  events,
  evidence,
  EVENT_KINDS,
  fundingRounds,
  FUNDING_SOURCE_KINDS,
  ORG_KINDS,
  organizationPeople,
  organizations,
  people,
  PROGRAM_RELATIONS,
  programs,
  PROJECT_STATUSES,
  projectPeople,
  projectPrograms,
  projects,
  REVIEW_STATUSES,
  roundInvestors,
  SOURCE_KINDS,
  SOURCE_REVIEW,
  sources,
  tokens,
  type ReviewStatus,
  type SourceKind,
  type SubjectType,
} from './schema';
import { addAliases, recordChange, takenSlugs, upsertEvidence, upsertSources } from './write';

export class EditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditError';
  }
}

// ---------------------------------------------------------------------------
// Fields editors may set, per record type — and how each is entered
// ---------------------------------------------------------------------------

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'url'
  | 'handle'
  | 'number'
  | 'money'
  | 'year'
  | 'date'
  | 'select'
  | 'list'
  | 'boolean'
  | 'project';

export interface FieldSpec {
  readonly key: string;
  readonly label: string;
  readonly kind: FieldKind;
  readonly options?: readonly string[];
  readonly help?: string;
  readonly required?: boolean;
}

export type EditableType =
  'project' | 'person' | 'organization' | 'round' | 'token' | 'program' | 'event';

export const EDITABLE_FIELDS: Record<EditableType, readonly FieldSpec[]> = {
  project: [
    { key: 'name', label: 'Name', kind: 'text', required: true },
    { key: 'tagline', label: 'What it does (one line)', kind: 'text' },
    { key: 'description', label: 'Description', kind: 'textarea' },
    { key: 'category', label: 'Category', kind: 'text' },
    { key: 'tags', label: 'Tags', kind: 'list', help: 'Comma-separated.' },
    { key: 'status', label: 'Status', kind: 'select', options: PROJECT_STATUSES },
    { key: 'foundedYear', label: 'Founded', kind: 'year' },
    { key: 'website', label: 'Website', kind: 'url' },
    { key: 'twitter', label: 'X account', kind: 'handle' },
    { key: 'githubOrgs', label: 'GitHub organisations', kind: 'list' },
    { key: 'discord', label: 'Discord', kind: 'url' },
    { key: 'telegram', label: 'Telegram', kind: 'url' },
    { key: 'docs', label: 'Docs', kind: 'url' },
    { key: 'logoUrl', label: 'Logo URL', kind: 'url' },
    { key: 'coingeckoId', label: 'CoinGecko id', kind: 'text' },
    { key: 'parentId', label: 'Parent project', kind: 'project' },
  ],
  person: [
    { key: 'name', label: 'Name', kind: 'text', required: true },
    { key: 'headline', label: 'Headline', kind: 'text' },
    { key: 'bio', label: 'Bio', kind: 'textarea' },
    { key: 'location', label: 'Location', kind: 'text' },
    { key: 'twitter', label: 'X account', kind: 'handle' },
    { key: 'github', label: 'GitHub login', kind: 'handle' },
    { key: 'linkedin', label: 'LinkedIn', kind: 'url' },
    { key: 'website', label: 'Website', kind: 'url' },
    { key: 'avatarUrl', label: 'Photo URL', kind: 'url' },
  ],
  organization: [
    { key: 'name', label: 'Name', kind: 'text', required: true },
    { key: 'kind', label: 'Type', kind: 'select', options: ORG_KINDS },
    { key: 'description', label: 'Description', kind: 'textarea' },
    { key: 'website', label: 'Website', kind: 'url' },
    { key: 'twitter', label: 'X account', kind: 'handle' },
    { key: 'location', label: 'Location', kind: 'text' },
    { key: 'foundedYear', label: 'Founded', kind: 'year' },
    { key: 'isInvestor', label: 'Listed as an investor', kind: 'boolean' },
    { key: 'logoUrl', label: 'Logo URL', kind: 'url' },
  ],
  round: [
    {
      key: 'roundType',
      label: 'Round type',
      kind: 'text',
      help: 'Seed, Series A, Strategic… as announced.',
    },
    {
      key: 'amountUsd',
      label: 'Amount (USD)',
      kind: 'money',
      help: 'Leave empty if undisclosed — never 0.',
    },
    { key: 'valuationUsd', label: 'Valuation (USD)', kind: 'money' },
    { key: 'announcedOn', label: 'Announced on', kind: 'date', required: true },
    { key: 'notes', label: 'Notes', kind: 'textarea' },
    { key: 'projectId', label: 'Project', kind: 'project', required: true },
  ],
  token: [
    { key: 'symbol', label: 'Symbol', kind: 'text' },
    { key: 'name', label: 'Name', kind: 'text' },
    { key: 'projectId', label: 'Project', kind: 'project' },
    { key: 'isPrimary', label: 'The project’s main token', kind: 'boolean' },
    { key: 'coingeckoId', label: 'CoinGecko id', kind: 'text' },
    { key: 'logoUrl', label: 'Logo URL', kind: 'url' },
  ],
  program: [
    { key: 'name', label: 'Name', kind: 'text' },
    { key: 'kind', label: 'What it does', kind: 'text', help: 'AMM, Lending, Perpetuals…' },
    { key: 'description', label: 'Description', kind: 'textarea' },
  ],
  event: [
    { key: 'title', label: 'Title', kind: 'text', required: true },
    { key: 'kind', label: 'Kind', kind: 'select', options: EVENT_KINDS, required: true },
    { key: 'startsOn', label: 'Starts on', kind: 'date', required: true },
    { key: 'endsOn', label: 'Ends on', kind: 'date' },
    { key: 'url', label: 'Link', kind: 'url' },
    { key: 'location', label: 'Location', kind: 'text' },
    { key: 'description', label: 'Description', kind: 'textarea' },
    { key: 'amountUsd', label: 'Amount (USD)', kind: 'money', help: 'For incidents: funds lost.' },
  ],
};

const TABLES = {
  project: projects,
  person: people,
  organization: organizations,
  round: fundingRounds,
  token: tokens,
  program: programs,
  event: events,
} as const;

const SQL_TABLE: Record<EditableType, string> = {
  project: 'projects',
  person: 'people',
  organization: 'organizations',
  round: 'funding_rounds',
  token: 'tokens',
  program: 'programs',
  event: 'events',
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a form's string values into typed values, validating each. */
export function parseFields(
  type: EditableType,
  input: Record<string, string | null | undefined>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const spec of EDITABLE_FIELDS[type]) {
    if (!(spec.key in input)) continue;
    const raw = (input[spec.key] ?? '').trim();
    let value: unknown = raw === '' ? null : raw;
    switch (spec.kind) {
      case 'url':
        if (value !== null && !/^https?:\/\/\S+$/i.test(raw))
          throw new EditError(`${spec.label} must be a full http(s) link.`);
        break;
      case 'handle':
        value =
          raw === ''
            ? null
            : raw
                .replace(/^https?:\/\/(www\.)?(twitter|x|github)\.com\//i, '')
                .replace(/^@/, '')
                .replace(/\/$/, '');
        break;
      case 'number':
      case 'money': {
        if (raw === '') break;
        const n = Number(raw.replace(/[$,\s]/g, ''));
        if (!Number.isFinite(n) || n < 0) throw new EditError(`${spec.label} must be a number.`);
        if (spec.kind === 'money' && n === 0)
          throw new EditError(`${spec.label}: leave it empty when undisclosed, rather than 0.`);
        value = n;
        break;
      }
      case 'year': {
        if (raw === '') break;
        const y = Number(raw);
        if (!Number.isInteger(y) || y < 1990 || y > 2100)
          throw new EditError(`${spec.label} must be a year.`);
        value = y;
        break;
      }
      case 'date':
        if (value !== null && !DATE.test(raw))
          throw new EditError(`${spec.label} must be a date (YYYY-MM-DD).`);
        break;
      case 'select':
        if (value !== null && !spec.options?.includes(raw))
          throw new EditError(`${spec.label} must be one of ${spec.options?.join(', ')}.`);
        break;
      case 'list':
        value =
          raw === ''
            ? []
            : [
                ...new Set(
                  raw
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                ),
              ];
        break;
      case 'boolean':
        value = raw === 'on' || raw === 'true' || raw === '1';
        break;
      case 'project': {
        if (raw === '') break;
        const id = Number(raw);
        if (!Number.isInteger(id) || id <= 0)
          throw new EditError(`${spec.label} must be chosen from the list.`);
        value = id;
        break;
      }
    }
    if (spec.required && (value === null || value === ''))
      throw new EditError(`${spec.label} is required.`);
    out[spec.key] = value;
  }
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const toDisplay = (v: unknown) => (v instanceof Date ? v.toISOString() : v);

export interface SourceArg {
  readonly url: string;
  readonly title?: string | null;
  readonly kind?: SourceKind | null;
  readonly note?: string | null;
}

async function editorSource(
  db: Executor,
  source: SourceArg | null | undefined,
): Promise<number | null> {
  if (!source?.url?.trim()) return null;
  if (!/^https?:\/\//i.test(source.url.trim()))
    throw new EditError('A source must be a full http(s) link.');
  if (source.kind && !SOURCE_KINDS.includes(source.kind))
    throw new EditError('Unknown source type.');
  const ids = await upsertSources(db, [
    { url: source.url, title: source.title ?? null, kind: source.kind ?? undefined },
  ]);
  return ids.get(canonicalUrl(source.url)) ?? null;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export async function updateRecord(
  db: Db,
  input: {
    type: EditableType;
    id: number;
    patch: Record<string, unknown>;
    actor: string;
    source?: SourceArg | null;
  },
): Promise<{ changed: string[] }> {
  const allowed = new Set(EDITABLE_FIELDS[input.type].map((f) => f.key));
  for (const key of Object.keys(input.patch))
    if (!allowed.has(key)) throw new EditError(`${key} cannot be edited here.`);
  const table = TABLES[input.type];

  return db.transaction(async (tx) => {
    const [current] = (await tx
      .select()
      .from(table)
      .where(eq(table.id, input.id))
      .limit(1)) as Record<string, unknown>[];
    if (!current) throw new EditError('That record no longer exists.');
    const changed = Object.keys(input.patch).filter((k) => !same(current[k], input.patch[k]));
    if (changed.length === 0) return { changed };
    if (input.type === 'project' && input.patch.parentId === input.id)
      throw new EditError('A project cannot be its own parent.');

    const locked = [...new Set([...((current.lockedFields as string[]) ?? []), ...changed])];
    await tx
      .update(table)
      .set({
        ...Object.fromEntries(changed.map((k) => [k, input.patch[k]])),
        lockedFields: locked,
        updatedAt: new Date(),
      } as never)
      .where(eq(table.id, input.id));

    if (input.type !== 'round' && input.patch.name && changed.includes('name')) {
      await addAliases(tx, input.type as SubjectType, [
        { subjectId: input.id, name: String(input.patch.name) },
      ]);
    }

    const sourceId = await editorSource(tx, input.source);
    if (sourceId) {
      await upsertEvidence(
        tx,
        changed.map((field) => ({
          subjectType: input.type as SubjectType,
          subjectId: input.id,
          field,
          sourceId,
          method: 'editor' as const,
          checkedBy: input.actor,
          note: input.source?.note ?? null,
        })),
      );
    }
    await recordChange(tx, {
      actor: input.actor,
      action: 'record.updated',
      subjectType: input.type as SubjectType,
      subjectId: input.id,
      summary: `Edited ${changed.join(', ')}`,
      diff: Object.fromEntries(
        changed.map((k) => [k, { from: toDisplay(current[k]), to: toDisplay(input.patch[k]) }]),
      ),
    });
    return { changed };
  });
}

/** Create a record. With a source it starts checked; without one it is flagged for review. */
export async function createRecord(
  db: Db,
  input: {
    type: EditableType;
    values: Record<string, unknown>;
    actor: string;
    source?: SourceArg | null;
    extra?: Record<string, unknown>;
  },
): Promise<{ id: number; slug: string | null }> {
  const { type, values, actor } = input;
  if (type === 'round' && !input.source?.url) {
    throw new EditError('A funding round needs its announcement: add the source link.');
  }
  return db.transaction(async (tx) => {
    const sourceId = await editorSource(tx, input.source);
    const now = new Date();
    const curation = sourceId
      ? { reviewStatus: 'verified' as const, checkedAt: now, checkedBy: actor }
      : { reviewStatus: 'needs_review' as const };
    const locked = Object.keys(values).filter((k) => values[k] !== null && values[k] !== undefined);
    let slug: string | null = null;
    const data: Record<string, unknown> = {
      ...values,
      ...input.extra,
      ...curation,
      lockedFields: locked,
    };

    if (type === 'project' || type === 'person' || type === 'organization' || type === 'event') {
      const base =
        type === 'event'
          ? `${String(values.title ?? 'event')}-${String(values.startsOn ?? '')}`
          : String(values.name ?? '');
      if (!base.trim()) throw new EditError('A name is required.');
      const taken = await takenSlugs(
        tx,
        type === 'project'
          ? 'projects'
          : type === 'person'
            ? 'people'
            : type === 'organization'
              ? 'organizations'
              : 'events',
      );
      slug = uniqueSlug(base, (s) => taken.has(s));
      data.slug = slug;
    }
    if (type === 'round') {
      const [project] = await tx
        .select({ slug: projects.slug })
        .from(projects)
        .where(eq(projects.id, Number(values.projectId)));
      if (!project) throw new EditError('Choose the project this round belongs to.');
      const taken = await takenSlugs(tx, 'funding_rounds');
      slug = uniqueSlug(
        `${project.slug}-${String(values.roundType ?? 'round')}-${String(values.announcedOn).slice(0, 7)}`,
        (s) => taken.has(s),
      );
      data.slug = slug;
    }
    if (
      type === 'token' &&
      !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(input.extra?.mint ?? ''))
    ) {
      throw new EditError('That is not a Solana mint address.');
    }
    if (
      type === 'program' &&
      !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(input.extra?.address ?? ''))
    ) {
      throw new EditError('That is not a Solana program address.');
    }
    if (type === 'organization' && data.isInvestor === undefined) data.isInvestor = true;

    const table = TABLES[type];
    const [saved] = (await tx
      .insert(table)
      .values(data as never)
      .returning({ id: table.id })) as { id: number }[];
    const id = saved!.id;
    if (type === 'project' || type === 'person' || type === 'organization') {
      await addAliases(tx, type, [{ subjectId: id, name: String(values.name) }]);
    }
    if (sourceId) {
      await upsertEvidence(tx, [
        {
          subjectType: type as SubjectType,
          subjectId: id,
          sourceId,
          method: 'editor',
          checkedBy: actor,
          note: input.source?.note ?? null,
        },
      ]);
    }
    await recordChange(tx, {
      actor,
      action: type === 'round' ? 'round.added' : `${type}.added`,
      subjectType: type as SubjectType,
      subjectId: id,
      summary: `Added ${String(values.name ?? values.title ?? values.roundType ?? input.extra?.mint ?? input.extra?.address ?? type)}`,
    });
    return { id, slug };
  });
}

/** Let imports update a field again. */
export async function unlockField(
  db: Db,
  input: { type: EditableType; id: number; field: string; actor: string },
) {
  const table = SQL_TABLE[input.type];
  await db.execute(
    sql`update ${sql.identifier(table)} set locked_fields = array_remove(locked_fields, ${input.field}) where id = ${input.id}`,
  );
  await recordChange(db, {
    actor: input.actor,
    action: 'record.unlocked',
    subjectType: input.type as SubjectType,
    subjectId: input.id,
    summary: `Imports may update ${input.field} again`,
  });
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export type ReviewTarget =
  | EditableType
  | 'project_person'
  | 'organization_person'
  | 'round_investor'
  | 'project_program'
  | 'news_mention'
  | 'event_link';

const REVIEW_TABLE: Record<ReviewTarget, string> = {
  ...SQL_TABLE,
  project_person: 'project_people',
  organization_person: 'organization_people',
  round_investor: 'round_investors',
  project_program: 'project_programs',
  news_mention: 'news_mentions',
  event_link: 'event_links',
};

/**
 * Confirm, flag or reject. Confirming stamps who checked it and when — the
 * "checked" date readers see. Rejecting hides it and keeps it, so the next
 * import cannot bring it back.
 */
export async function setReview(
  db: Db,
  input: {
    target: ReviewTarget;
    id: number;
    status: ReviewStatus;
    actor: string;
    note?: string | null;
  },
): Promise<void> {
  if (!REVIEW_STATUSES.includes(input.status)) throw new EditError('Unknown review status.');
  const table = REVIEW_TABLE[input.target];
  const verified = input.status === 'verified';
  await db.transaction(async (tx) => {
    const found = await rows<{ id: number }>(
      tx,
      sql`update ${sql.identifier(table)} set review_status = ${input.status},
            checked_at = ${verified ? sql`now()` : sql`checked_at`},
            checked_by = ${verified ? sql`${input.actor}` : sql`checked_by`}
          where id = ${input.id} returning id`,
    );
    if (found.length === 0) throw new EditError('That record no longer exists.');
    await recordChange(tx, {
      actor: input.actor,
      action: verified
        ? 'record.verified'
        : input.status === 'rejected'
          ? 'record.rejected'
          : 'record.flagged',
      subjectType: input.target as SubjectType,
      subjectId: input.id,
      summary: `${verified ? 'Checked' : input.status === 'rejected' ? 'Rejected' : 'Flagged for review'}${input.note ? `: ${input.note}` : ''}`,
    });
  });
}

/** Confirm many at once — "everything on this profile checks out". */
export async function setReviewMany(
  db: Db,
  items: readonly { target: ReviewTarget; id: number }[],
  status: ReviewStatus,
  actor: string,
): Promise<number> {
  let n = 0;
  for (const item of items) {
    await setReview(db, { ...item, status, actor });
    n += 1;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

async function findOrCreatePerson(
  tx: Executor,
  person: { id?: number | null; name?: string | null },
  actor: string,
): Promise<number> {
  if (person.id) return person.id;
  const name = person.name?.trim();
  if (!name) throw new EditError('Choose a person or type a new name.');
  const [known] = await rows<{ subject_id: number }>(
    tx,
    sql`select subject_id from aliases where subject_type = 'person' and alias = ${normalizeName(name)} limit 1`,
  );
  if (known) return known.subject_id;
  const taken = await takenSlugs(tx, 'people');
  const [row] = await tx
    .insert(people)
    .values({ slug: uniqueSlug(name, (s) => taken.has(s)), name, reviewStatus: 'needs_review' })
    .returning({ id: people.id });
  await addAliases(tx, 'person', [{ subjectId: row!.id, name }]);
  await recordChange(tx, {
    actor,
    action: 'person.added',
    subjectType: 'person',
    subjectId: row!.id,
    summary: `Added ${name}`,
  });
  return row!.id;
}

async function findOrCreateOrganization(
  tx: Executor,
  org: { id?: number | null; name?: string | null },
  actor: string,
): Promise<number> {
  if (org.id) return org.id;
  const name = org.name?.trim();
  if (!name) throw new EditError('Choose an organisation or type a new name.');
  const [known] = await rows<{ subject_id: number }>(
    tx,
    sql`select subject_id from aliases where subject_type = 'organization' and alias = ${normalizeName(name)} limit 1`,
  );
  if (known) return known.subject_id;
  const taken = await takenSlugs(tx, 'organizations');
  const [row] = await tx
    .insert(organizations)
    .values({
      slug: uniqueSlug(name, (s) => taken.has(s)),
      name,
      reviewStatus: 'needs_review',
      isInvestor: true,
    })
    .returning({ id: organizations.id });
  await addAliases(tx, 'organization', [{ subjectId: row!.id, name }]);
  await recordChange(tx, {
    actor,
    action: 'organization.added',
    subjectType: 'organization',
    subjectId: row!.id,
    summary: `Added ${name}`,
  });
  return row!.id;
}

/** "This person works at this project (or organisation)", with its source. */
export async function linkPerson(
  db: Db,
  input: {
    to: 'project' | 'organization';
    targetId: number;
    person: { id?: number | null; name?: string | null };
    role: string;
    isCurrent: boolean;
    startedOn?: string | null;
    endedOn?: string | null;
    source?: SourceArg | null;
    actor: string;
  },
): Promise<number> {
  const role = input.role.trim();
  if (!role) throw new EditError('A role is required — Co-founder, CEO, Partner…');
  for (const d of [input.startedOn, input.endedOn])
    if (d && !DATE.test(d)) throw new EditError('Dates must be YYYY-MM-DD.');
  return db.transaction(async (tx) => {
    const personId = await findOrCreatePerson(tx, input.person, input.actor);
    const sourceId = await editorSource(tx, input.source);
    const status: ReviewStatus = sourceId ? 'verified' : 'needs_review';
    const values = {
      personId,
      role,
      isCurrent: input.isCurrent,
      startedOn: input.startedOn || null,
      endedOn: input.endedOn || null,
      reviewStatus: status,
      checkedAt: sourceId ? new Date() : null,
      checkedBy: sourceId ? input.actor : null,
    };
    const [link] =
      input.to === 'project'
        ? await tx
            .insert(projectPeople)
            .values({ ...values, projectId: input.targetId })
            .onConflictDoUpdate({
              target: [projectPeople.projectId, projectPeople.personId, projectPeople.role],
              set: {
                isCurrent: values.isCurrent,
                startedOn: values.startedOn,
                endedOn: values.endedOn,
                reviewStatus: status,
                checkedAt: values.checkedAt,
                checkedBy: values.checkedBy,
              },
            })
            .returning({ id: projectPeople.id })
        : await tx
            .insert(organizationPeople)
            .values({ ...values, organizationId: input.targetId })
            .onConflictDoUpdate({
              target: [
                organizationPeople.organizationId,
                organizationPeople.personId,
                organizationPeople.role,
              ],
              set: {
                isCurrent: values.isCurrent,
                startedOn: values.startedOn,
                endedOn: values.endedOn,
                reviewStatus: status,
                checkedAt: values.checkedAt,
                checkedBy: values.checkedBy,
              },
            })
            .returning({ id: organizationPeople.id });
    const subjectType = input.to === 'project' ? 'project_person' : 'organization_person';
    if (sourceId) {
      await upsertEvidence(tx, [
        {
          subjectType,
          subjectId: link!.id,
          sourceId,
          method: 'editor',
          checkedBy: input.actor,
          note: input.source?.note ?? null,
        },
      ]);
    }
    await recordChange(tx, {
      actor: input.actor,
      action: 'person.linked',
      subjectType: input.to,
      subjectId: input.targetId,
      summary: `Linked a person as ${role}`,
    });
    return link!.id;
  });
}

/** "This investor joined this round", with the announcement that says so. */
export async function addRoundInvestor(
  db: Db,
  input: {
    roundId: number;
    party: { type: 'organization' | 'person'; id?: number | null; name?: string | null };
    isLead: boolean;
    source?: SourceArg | null;
    actor: string;
  },
): Promise<number> {
  return db.transaction(async (tx) => {
    const partyId =
      input.party.type === 'person'
        ? await findOrCreatePerson(tx, input.party, input.actor)
        : await findOrCreateOrganization(tx, input.party, input.actor);
    const sourceId = await editorSource(tx, input.source);
    const status: ReviewStatus = sourceId ? 'verified' : 'needs_review';
    const existing = await tx
      .select({ id: roundInvestors.id })
      .from(roundInvestors)
      .where(
        and(
          eq(roundInvestors.roundId, input.roundId),
          input.party.type === 'person'
            ? eq(roundInvestors.personId, partyId)
            : eq(roundInvestors.organizationId, partyId),
        ),
      );
    let linkId: number;
    if (existing[0]) {
      linkId = existing[0].id;
      await tx
        .update(roundInvestors)
        .set({
          isLead: input.isLead,
          reviewStatus: status,
          checkedAt: sourceId ? new Date() : null,
          checkedBy: sourceId ? input.actor : null,
        })
        .where(eq(roundInvestors.id, linkId));
    } else {
      const [row] = await tx
        .insert(roundInvestors)
        .values({
          roundId: input.roundId,
          organizationId: input.party.type === 'organization' ? partyId : null,
          personId: input.party.type === 'person' ? partyId : null,
          isLead: input.isLead,
          nameAsReported: input.party.name ?? null,
          reviewStatus: status,
          checkedAt: sourceId ? new Date() : null,
          checkedBy: sourceId ? input.actor : null,
        })
        .returning({ id: roundInvestors.id });
      linkId = row!.id;
    }
    if (input.party.type === 'organization') {
      await tx.update(organizations).set({ isInvestor: true }).where(eq(organizations.id, partyId));
    }
    if (sourceId) {
      // Throws for an on-chain source: a transfer is not an announcement.
      await upsertEvidence(tx, [
        {
          subjectType: 'round_investor',
          subjectId: linkId,
          sourceId,
          method: 'editor',
          checkedBy: input.actor,
          note: input.source?.note ?? null,
        },
      ]);
    }
    await recordChange(tx, {
      actor: input.actor,
      action: 'link.added',
      subjectType: 'round',
      subjectId: input.roundId,
      summary: `Added an investor${input.isLead ? ' (lead)' : ''}`,
    });
    return linkId;
  });
}

/** "This project operates (or uses) this program." Creates the program record if new. */
export async function linkProgram(
  db: Db,
  input: {
    projectId: number;
    address: string;
    relation: string;
    name?: string | null;
    note?: string | null;
    source?: SourceArg | null;
    actor: string;
  },
): Promise<number> {
  const address = input.address.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address))
    throw new EditError('That is not a Solana program address.');
  if (!PROGRAM_RELATIONS.includes(input.relation as never))
    throw new EditError('Choose operates or uses.');
  return db.transaction(async (tx) => {
    const [program] = await tx
      .insert(programs)
      .values({ address, name: input.name?.trim() || null, reviewStatus: 'unreviewed' })
      .onConflictDoUpdate({
        target: programs.address,
        set: { name: sql`coalesce(${programs.name}, excluded.name)` },
      })
      .returning({ id: programs.id });
    const sourceId = await editorSource(tx, input.source);
    const status: ReviewStatus = sourceId ? 'verified' : 'needs_review';
    const [link] = await tx
      .insert(projectPrograms)
      .values({
        projectId: input.projectId,
        programId: program!.id,
        relation: input.relation as never,
        note: input.note ?? null,
        reviewStatus: status,
        checkedAt: sourceId ? new Date() : null,
        checkedBy: sourceId ? input.actor : null,
      })
      .onConflictDoUpdate({
        target: [projectPrograms.projectId, projectPrograms.programId],
        set: {
          relation: input.relation as never,
          note: input.note ?? null,
          reviewStatus: status,
          checkedAt: sourceId ? new Date() : null,
          checkedBy: sourceId ? input.actor : null,
        },
      })
      .returning({ id: projectPrograms.id });
    if (sourceId) {
      await upsertEvidence(tx, [
        {
          subjectType: 'project_program',
          subjectId: link!.id,
          sourceId,
          method: 'editor',
          checkedBy: input.actor,
          note: input.source?.note ?? null,
        },
      ]);
    }
    await recordChange(tx, {
      actor: input.actor,
      action: 'program.linked',
      subjectType: 'project',
      subjectId: input.projectId,
      summary: `Mapped program ${address.slice(0, 4)}…${address.slice(-4)} (${input.relation})`,
    });
    return link!.id;
  });
}

/** "This mint is this project's token." */
export async function linkToken(
  db: Db,
  input: {
    projectId: number;
    mint: string;
    isPrimary: boolean;
    source?: SourceArg | null;
    actor: string;
  },
): Promise<number> {
  const mint = input.mint.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint))
    throw new EditError('That is not a Solana mint address.');
  return db.transaction(async (tx) => {
    const sourceId = await editorSource(tx, input.source);
    const [token] = await tx
      .insert(tokens)
      .values({
        mint,
        projectId: input.projectId,
        isPrimary: input.isPrimary,
        lockedFields: ['projectId', 'isPrimary'],
      })
      .onConflictDoUpdate({
        target: tokens.mint,
        set: {
          projectId: input.projectId,
          isPrimary: input.isPrimary,
          lockedFields: sql`array(select distinct unnest(${tokens.lockedFields} || array['projectId', 'isPrimary']))`,
          reviewStatus: sourceId ? 'verified' : 'needs_review',
        },
      })
      .returning({ id: tokens.id });
    if (input.isPrimary) {
      await tx.execute(
        sql`update ${tokens} set is_primary = false where project_id = ${input.projectId} and id <> ${token!.id}`,
      );
    }
    if (sourceId) {
      await upsertEvidence(tx, [
        {
          subjectType: 'token',
          subjectId: token!.id,
          field: 'projectId',
          sourceId,
          method: 'editor',
          checkedBy: input.actor,
          note: input.source?.note ?? null,
        },
      ]);
    }
    await recordChange(tx, {
      actor: input.actor,
      action: 'link.added',
      subjectType: 'project',
      subjectId: input.projectId,
      summary: `Mapped token ${mint.slice(0, 4)}…${mint.slice(-4)}`,
    });
    return token!.id;
  });
}

/** Edit a connection's own fields: a role, dates, lead or not. */
export async function updateLink(
  db: Db,
  input: {
    target: 'project_person' | 'organization_person' | 'round_investor' | 'project_program';
    id: number;
    patch: {
      role?: string;
      isCurrent?: boolean;
      startedOn?: string | null;
      endedOn?: string | null;
      isLead?: boolean;
      relation?: string;
      note?: string | null;
    };
    actor: string;
  },
): Promise<void> {
  const table = {
    project_person: projectPeople,
    organization_person: organizationPeople,
    round_investor: roundInvestors,
    project_program: projectPrograms,
  }[input.target];
  const allowed: Record<string, string[]> = {
    project_person: ['role', 'isCurrent', 'startedOn', 'endedOn'],
    organization_person: ['role', 'isCurrent', 'startedOn', 'endedOn'],
    round_investor: ['isLead'],
    project_program: ['relation', 'note'],
  };
  const patch = Object.fromEntries(
    Object.entries(input.patch).filter(
      ([k, v]) => allowed[input.target]!.includes(k) && v !== undefined,
    ),
  );
  for (const d of [patch.startedOn, patch.endedOn])
    if (d && !DATE.test(String(d))) throw new EditError('Dates must be YYYY-MM-DD.');
  if (patch.relation && !PROGRAM_RELATIONS.includes(patch.relation as never))
    throw new EditError('Choose operates or uses.');
  if (Object.keys(patch).length === 0) return;
  await db.transaction(async (tx) => {
    await tx
      .update(table)
      .set(patch as never)
      .where(eq(table.id, input.id));
    await recordChange(tx, {
      actor: input.actor,
      action: 'link.updated',
      subjectType: input.target,
      subjectId: input.id,
      summary: `Edited ${Object.keys(patch).join(', ')}`,
      diff: Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, { from: null, to: v }])),
    });
  });
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export async function addEvidence(
  db: Db,
  input: {
    subjectType: SubjectType;
    subjectId: number;
    field?: string;
    source: SourceArg;
    actor: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const sourceId = await editorSource(tx, input.source);
    if (!sourceId) throw new EditError('Add the source link.');
    await upsertEvidence(tx, [
      {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        field: input.field ?? '',
        sourceId,
        method: 'editor',
        checkedBy: input.actor,
        note: input.source.note ?? null,
      },
    ]);
    await recordChange(tx, {
      actor: input.actor,
      action: 'evidence.added',
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      summary: `Added a source${input.field ? ` for ${input.field}` : ''}: ${canonicalUrl(input.source.url)}`,
    });
  });
}

/** "I read this source and it supports this fact" — stamps the check with the editor's name. */
export async function confirmEvidence(
  db: Db,
  input: { evidenceId: number; actor: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(evidence)
      .set({ method: 'editor', checkedBy: input.actor, checkedAt: new Date() })
      .where(eq(evidence.id, input.evidenceId))
      .returning({ subjectType: evidence.subjectType, subjectId: evidence.subjectId });
    if (!row) throw new EditError('That evidence no longer exists.');
    await recordChange(tx, {
      actor: input.actor,
      action: 'evidence.confirmed',
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      summary: 'Confirmed a source',
    });
  });
}

export async function removeEvidence(
  db: Db,
  input: { evidenceId: number; actor: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(evidence).where(eq(evidence.id, input.evidenceId)).returning({
      subjectType: evidence.subjectType,
      subjectId: evidence.subjectId,
      sourceId: evidence.sourceId,
    });
    if (!row) return;
    await recordChange(tx, {
      actor: input.actor,
      action: 'evidence.removed',
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      summary: 'Removed a source',
    });
  });
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export async function reviewSource(
  db: Db,
  input: {
    sourceId: number;
    status: string;
    kind?: string | null;
    title?: string | null;
    notes?: string | null;
    actor: string;
  },
): Promise<void> {
  if (!SOURCE_REVIEW.includes(input.status as never)) throw new EditError('Unknown source status.');
  if (input.kind && !SOURCE_KINDS.includes(input.kind as never))
    throw new EditError('Unknown source type.');
  await db.transaction(async (tx) => {
    if (input.kind) {
      // An on-chain source cannot back a funding fact, however it is relabelled.
      const [funding] = await rows<{ n: number }>(
        tx,
        sql`select count(*)::int as n from evidence where source_id = ${input.sourceId} and subject_type in ('round', 'round_investor')`,
      );
      if ((funding?.n ?? 0) > 0 && !FUNDING_SOURCE_KINDS.includes(input.kind as SourceKind)) {
        throw new EditError(
          'This source backs funding facts, so it must be an announcement, press, a filing, a post or a funding database.',
        );
      }
    }
    await tx
      .update(sources)
      .set({
        reviewStatus: input.status as never,
        ...(input.kind ? { kind: input.kind as SourceKind } : {}),
        ...(input.title !== undefined ? { title: input.title || null } : {}),
        notes: input.notes ?? null,
        reviewedBy: input.actor,
        reviewedAt: new Date(),
      })
      .where(eq(sources.id, input.sourceId));
    await recordChange(tx, {
      actor: input.actor,
      action: 'source.reviewed',
      summary: `Source #${input.sourceId} marked ${input.status}`,
    });
  });
}

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

export type MergeType = 'project' | 'person' | 'organization' | 'round';

/**
 * Merge `loserId` into `winnerId`. Every connection, alias, mention and piece
 * of evidence moves to the winner; where both already had the same
 * connection, the winner's is kept and the loser's evidence moves onto it.
 * The loser stays as a tombstone pointing at the winner, so its old links
 * redirect and imports that knew it by its old name now find the winner.
 */
export async function mergeRecords(
  db: Db,
  input: { type: MergeType; winnerId: number; loserId: number; actor: string },
): Promise<void> {
  const { type, winnerId: w, loserId: l } = input;
  if (w === l) throw new EditError('Choose two different records.');
  const table = {
    project: 'projects',
    person: 'people',
    organization: 'organizations',
    round: 'funding_rounds',
  }[type];

  await db.transaction(async (tx) => {
    const both = await rows<{ id: number; name: string; merged_into_id: number | null }>(
      tx,
      sql`select id, ${sql.raw(type === 'round' ? "coalesce(round_type, 'round') || ' ' || announced_on::text" : 'name')} as name, merged_into_id
          from ${sql.identifier(table)} where id in (${w}, ${l})`,
    );
    if (both.length !== 2 || both.some((b) => b.merged_into_id))
      throw new EditError('Both records must exist and not already be merged.');
    const winnerName = both.find((b) => b.id === w)!.name;
    const loserName = both.find((b) => b.id === l)!.name;

    /** Re-point a link table's column from loser to winner, folding duplicates. */
    const move = async (
      link: string,
      subjectType: SubjectType | null,
      column: string,
      keys: string[],
    ) => {
      const match = keys.map((k) => `a.${k} = b.${k}`).join(' and ');
      if (subjectType) {
        // Evidence on a duplicate link moves to the winner's twin first.
        await tx.execute(
          sql.raw(`insert into evidence (subject_type, subject_id, field, source_id, method, checked_at, checked_by, note)
            select e.subject_type, b.id, e.field, e.source_id, e.method, e.checked_at, e.checked_by, e.note
            from evidence e join ${link} a on e.subject_type = '${subjectType}' and e.subject_id = a.id
            join ${link} b on b.${column} = ${w} and ${match || 'true'}
            where a.${column} = ${l}
            on conflict do nothing`),
        );
        await tx.execute(
          sql.raw(`delete from evidence e using ${link} a, ${link} b
            where e.subject_type = '${subjectType}' and e.subject_id = a.id and a.${column} = ${l}
              and b.${column} = ${w} and ${match || 'true'}`),
        );
      }
      await tx.execute(
        sql.raw(
          `delete from ${link} a using ${link} b where a.${column} = ${l} and b.${column} = ${w} and ${match || 'true'}`,
        ),
      );
      await tx.execute(sql.raw(`update ${link} set ${column} = ${w} where ${column} = ${l}`));
    };

    /** Re-point polymorphic references (evidence, aliases, mentions, event links). */
    const movePoly = async (poly: string, keys: string[]) => {
      const match = keys.map((k) => `a.${k} = b.${k}`).join(' and ');
      await tx.execute(
        sql.raw(`delete from ${poly} a using ${poly} b
          where a.subject_type = '${type}' and a.subject_id = ${l} and b.subject_type = '${type}' and b.subject_id = ${w}
            ${match ? `and ${match}` : ''}`),
      );
      await tx.execute(
        sql.raw(
          `update ${poly} set subject_id = ${w} where subject_type = '${type}' and subject_id = ${l}`,
        ),
      );
    };

    if (type === 'project') {
      await move('project_people', 'project_person', 'project_id', ['person_id', 'role']);
      await move('project_programs', 'project_program', 'project_id', ['program_id']);
      await tx.execute(sql`update funding_rounds set project_id = ${w} where project_id = ${l}`);
      await tx.execute(sql`update tokens set project_id = ${w} where project_id = ${l}`);
      await tx.execute(
        sql`update projects set parent_id = ${w} where parent_id = ${l} and id <> ${w}`,
      );
      await tx.execute(sql`update project_metrics set project_id = ${w} where project_id = ${l}`);
      await tx.execute(
        sql`delete from sync_state where subject_type = 'project' and subject_id = ${l}`,
      );
      // The winner inherits the loser's source identity when it has none of its
      // own. The loser's key is cleared first: keys are unique.
      await tx.execute(sql`
        update projects w set
          defillama_ids = array(select distinct unnest(w.defillama_ids || l.defillama_ids)),
          defillama_slugs = array(select distinct unnest(w.defillama_slugs || l.defillama_slugs)),
          github_orgs = array(select distinct unnest(w.github_orgs || l.github_orgs))
        from projects l where w.id = ${w} and l.id = ${l}`);
      const [lk] = await rows<{ key: string | null }>(
        tx,
        sql`select defillama_key as key from projects where id = ${l}`,
      );
      if (lk?.key) {
        await tx.execute(sql`update projects set defillama_key = null where id = ${l}`);
        await tx.execute(
          sql`update projects set defillama_key = coalesce(defillama_key, ${lk.key}) where id = ${w}`,
        );
      }
    }
    if (type === 'person') {
      await move('project_people', 'project_person', 'person_id', ['project_id', 'role']);
      await move('organization_people', 'organization_person', 'person_id', [
        'organization_id',
        'role',
      ]);
      await move('round_investors', 'round_investor', 'person_id', ['round_id']);
    }
    if (type === 'organization') {
      await move('organization_people', 'organization_person', 'organization_id', [
        'person_id',
        'role',
      ]);
      await move('round_investors', 'round_investor', 'organization_id', ['round_id']);
      await tx.execute(
        sql`update organizations set is_investor = true where id = ${w} and exists (select 1 from round_investors where organization_id = ${w})`,
      );
    }
    if (type === 'round') {
      await tx.execute(sql`
        delete from evidence e using round_investors a, round_investors b
        where e.subject_type = 'round_investor' and e.subject_id = a.id and a.round_id = ${l} and b.round_id = ${w}
          and (a.organization_id = b.organization_id or a.person_id = b.person_id)`);
      await tx.execute(sql`
        delete from round_investors a using round_investors b
        where a.round_id = ${l} and b.round_id = ${w}
          and (a.organization_id = b.organization_id or a.person_id = b.person_id)`);
      await tx.execute(sql`update round_investors set round_id = ${w} where round_id = ${l}`);
      const [lk] = await rows<{ key: string | null }>(
        tx,
        sql`select external_key as key from funding_rounds where id = ${l}`,
      );
      if (lk?.key) {
        await tx.execute(sql`update funding_rounds set external_key = null where id = ${l}`);
        await tx.execute(
          sql`update funding_rounds set external_key = coalesce(external_key, ${lk.key}) where id = ${w}`,
        );
      }
    }

    await movePoly('evidence', ['field', 'source_id']);
    await movePoly('news_mentions', ['news_id']);
    await movePoly('event_links', ['event_id']);
    await movePoly('aliases', ['alias']);

    await tx.execute(
      sql`update ${sql.identifier(table)} set merged_into_id = ${w}, updated_at = now() where id = ${l}`,
    );
    // Re-point any earlier tombstones at the new winner, so redirects never chain.
    await tx.execute(
      sql`update ${sql.identifier(table)} set merged_into_id = ${w} where merged_into_id = ${l}`,
    );
    if (type !== 'round') await addAliases(tx, type, [{ subjectId: w, name: loserName }]);

    await recordChange(tx, {
      actor: input.actor,
      action: 'record.merged',
      subjectType: type,
      subjectId: w,
      summary: `Merged “${loserName}” into “${winnerName}”`,
      diff: { mergedId: { from: l, to: w } },
    });
  });
}

export async function dismissDuplicate(
  db: Db,
  input: { type: MergeType; a: number; b: number; actor: string },
): Promise<void> {
  const [a, b] = input.a < input.b ? [input.a, input.b] : [input.b, input.a];
  await db
    .insert(distinctPairs)
    .values({ subjectType: input.type, aId: a, bId: b, decidedBy: input.actor })
    .onConflictDoNothing();
  await recordChange(db, {
    actor: input.actor,
    action: 'duplicate.dismissed',
    subjectType: input.type,
    subjectId: a,
    summary: `Not a duplicate of #${b}`,
  });
}

/**
 * An investor imported as an organisation is really a person, or the other
 * way round. Creates the record of the right kind, moves every round the old
 * one joined, its evidence and aliases, and retires the old record.
 */
export async function convertParty(
  db: Db,
  input: { from: 'organization' | 'person'; id: number; actor: string },
): Promise<{ id: number; slug: string }> {
  return db.transaction(async (tx) => {
    const fromTable = input.from === 'organization' ? 'organizations' : 'people';
    const [old] = await rows<{ name: string; twitter: string | null; website: string | null }>(
      tx,
      sql`select name, twitter, website from ${sql.identifier(fromTable)} where id = ${input.id} and merged_into_id is null`,
    );
    if (!old) throw new EditError('That record no longer exists.');
    const toType = input.from === 'organization' ? 'person' : 'organization';
    const taken = await takenSlugs(tx, toType === 'person' ? 'people' : 'organizations');
    const slug = uniqueSlug(old.name, (s) => taken.has(s));
    const values = {
      slug,
      name: old.name,
      twitter: old.twitter,
      website: old.website,
      reviewStatus: 'verified' as const,
      checkedAt: new Date(),
      checkedBy: input.actor,
    };
    const [created] =
      toType === 'person'
        ? await tx.insert(people).values(values).returning({ id: people.id })
        : await tx
            .insert(organizations)
            .values({ ...values, isInvestor: true })
            .returning({ id: organizations.id });
    const newId = created!.id;
    if (input.from === 'organization') {
      await tx.execute(
        sql`update round_investors set person_id = ${newId}, organization_id = null where organization_id = ${input.id}`,
      );
    } else {
      await tx.execute(
        sql`update round_investors set organization_id = ${newId}, person_id = null where person_id = ${input.id}`,
      );
    }
    await tx.execute(
      sql`update evidence set subject_type = ${toType}, subject_id = ${newId} where subject_type = ${input.from} and subject_id = ${input.id}`,
    );
    await tx.execute(
      sql`delete from aliases where subject_type = ${input.from} and subject_id = ${input.id}`,
    );
    await addAliases(tx, toType, [{ subjectId: newId, name: old.name }]);
    await tx.execute(
      sql`update ${sql.identifier(fromTable)} set review_status = 'rejected', updated_at = now() where id = ${input.id}`,
    );
    await recordChange(tx, {
      actor: input.actor,
      action: 'record.converted',
      subjectType: toType,
      subjectId: newId,
      summary: `Converted “${old.name}” from ${input.from === 'organization' ? 'an organisation to a person' : 'a person to an organisation'}`,
    });
    return { id: newId, slug };
  });
}

/** Slug for a record type and id, for redirecting after an edit. */
export async function slugOf(
  db: Executor,
  type: 'project' | 'person' | 'organization' | 'round',
  id: number,
): Promise<string | null> {
  const table = {
    project: 'projects',
    person: 'people',
    organization: 'organizations',
    round: 'funding_rounds',
  }[type];
  const [row] = await rows<{ slug: string }>(
    db,
    sql`select slug from ${sql.identifier(table)} where id = ${id}`,
  );
  return row?.slug ?? null;
}

export { toSlug };
