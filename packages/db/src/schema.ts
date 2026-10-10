/**
 * The research database.
 *
 * Every kind of thing is its own record — projects, people, organisations,
 * funding rounds, tokens, Solana programs, news, events, sources — and every
 * connection between two records is a row of its own, so a connection can
 * carry what an entity cannot: a role, a start date, whether it is current,
 * and the evidence for it.
 *
 * Three rules the schema is built around:
 *
 *  1. A fact is only as good as its source. `evidence` ties any record, any
 *     single field of a record, or any relationship to a `sources` row, with
 *     the date it was checked and how (imported, entered by an editor, read
 *     on-chain, inferred).
 *  2. Funding is announced, not observed. A funding round is evidenced by an
 *     announcement, press, a filing or a funding database — never by a wallet
 *     moving SOL. On-chain activity lives in its own tables and is never used
 *     to create, size or date a round.
 *  3. Imports never overwrite people. A field an editor has set is listed in
 *     the record's `locked_fields`; importers skip it. A record an editor has
 *     rejected or merged stays as a tombstone, so the next import cannot
 *     resurrect it.
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------

/** Where a record stands with the editors. */
export const REVIEW_STATUSES = ['unreviewed', 'needs_review', 'verified', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const PROJECT_STATUSES = ['active', 'inactive', 'acquired', 'closed', 'pre_launch'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const ORG_KINDS = [
  'vc',
  'angel_group',
  'accelerator',
  'exchange',
  'foundation',
  'dao',
  'corporate',
  'company',
  'other',
] as const;
export type OrgKind = (typeof ORG_KINDS)[number];

/** What a source is. `onchain` sources may never evidence a funding round. */
export const SOURCE_KINDS = [
  'announcement',
  'press',
  'filing',
  'social',
  'database',
  'api',
  'website',
  'repository',
  'registry',
  'onchain',
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** Source kinds that can evidence a funding round. */
export const FUNDING_SOURCE_KINDS: readonly SourceKind[] = [
  'announcement',
  'press',
  'filing',
  'social',
  'database',
];

export const SOURCE_REVIEW = ['unreviewed', 'ok', 'broken', 'unreliable'] as const;
export type SourceReview = (typeof SOURCE_REVIEW)[number];

/** How a piece of evidence was obtained. */
export const EVIDENCE_METHODS = ['imported', 'editor', 'onchain', 'inferred'] as const;
export type EvidenceMethod = (typeof EVIDENCE_METHODS)[number];

/** Anything evidence, aliases, mentions or the change log can point at. */
export const SUBJECT_TYPES = [
  'project',
  'person',
  'organization',
  'round',
  'token',
  'program',
  'event',
  'news',
  'project_person',
  'organization_person',
  'round_investor',
  'project_program',
] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export const EVENT_KINDS = [
  'launch',
  'token_launch',
  'upgrade',
  'milestone',
  'incident',
  'governance',
  'conference',
  'hackathon',
  'other',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const PROGRAM_RELATIONS = ['operates', 'uses'] as const;
export type ProgramRelation = (typeof PROGRAM_RELATIONS)[number];

// ---------------------------------------------------------------------------
// Shared columns
// ---------------------------------------------------------------------------

const stamp = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const emptyArray = sql`'{}'::text[]`;

/** Curation state carried by every editable record. */
const curated = () => ({
  reviewStatus: text('review_status').$type<ReviewStatus>().notNull().default('unreviewed'),
  checkedAt: stamp('checked_at'),
  checkedBy: text('checked_by'),
  /** Fields an editor has set. Importers leave these alone. */
  lockedFields: text('locked_fields').array().notNull().default(emptyArray),
  createdAt: stamp('created_at').notNull().defaultNow(),
  updatedAt: stamp('updated_at').notNull().defaultNow(),
});

/** Curation state carried by every relationship row. */
const linked = () => ({
  reviewStatus: text('review_status').$type<ReviewStatus>().notNull().default('unreviewed'),
  checkedAt: stamp('checked_at'),
  checkedBy: text('checked_by'),
  createdAt: stamp('created_at').notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export const projects = pgTable(
  'projects',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    /** One line: what the project does. */
    tagline: text('tagline'),
    description: text('description'),
    logoUrl: text('logo_url'),
    category: text('category'),
    tags: text('tags').array().notNull().default(emptyArray),
    /** `null` means nobody has assessed it — not that it is active. */
    status: text('status').$type<ProjectStatus>(),
    foundedYear: integer('founded_year'),
    website: text('website'),
    twitter: text('twitter'),
    githubOrgs: text('github_orgs').array().notNull().default(emptyArray),
    discord: text('discord'),
    telegram: text('telegram'),
    docs: text('docs'),
    parentId: integer('parent_id').references((): AnyPgColumn => projects.id, {
      onDelete: 'set null',
    }),
    /** DefiLlama's id for this project: a protocol slug or a parent id. */
    defillamaKey: text('defillama_key').unique(),
    /** Every DefiLlama protocol id and slug rolled up into this project. */
    defillamaIds: text('defillama_ids').array().notNull().default(emptyArray),
    defillamaSlugs: text('defillama_slugs').array().notNull().default(emptyArray),
    coingeckoId: text('coingecko_id'),
    mergedIntoId: integer('merged_into_id').references((): AnyPgColumn => projects.id, {
      onDelete: 'set null',
    }),
    ...curated(),
  },
  (t) => [index('projects_category_idx').on(t.category), index('projects_name_idx').on(t.name)],
);

export const people = pgTable('people', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  /** One line: who they are. */
  headline: text('headline'),
  bio: text('bio'),
  location: text('location'),
  twitter: text('twitter'),
  github: text('github'),
  linkedin: text('linkedin'),
  website: text('website'),
  mergedIntoId: integer('merged_into_id').references((): AnyPgColumn => people.id, {
    onDelete: 'set null',
  }),
  ...curated(),
});

export const organizations = pgTable(
  'organizations',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    /** `null` until someone classifies it. */
    kind: text('kind').$type<OrgKind>(),
    logoUrl: text('logo_url'),
    description: text('description'),
    website: text('website'),
    twitter: text('twitter'),
    location: text('location'),
    foundedYear: integer('founded_year'),
    /** Listed in the investor directory. */
    isInvestor: boolean('is_investor').notNull().default(false),
    mergedIntoId: integer('merged_into_id').references((): AnyPgColumn => organizations.id, {
      onDelete: 'set null',
    }),
    ...curated(),
  },
  (t) => [index('organizations_investor_idx').on(t.isInvestor)],
);

export const fundingRounds = pgTable(
  'funding_rounds',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    slug: text('slug').notNull().unique(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** As announced: "Seed", "Series A", "Strategic". `null` when not stated. */
    roundType: text('round_type'),
    /** USD. `null` when undisclosed — never zero. */
    amountUsd: doublePrecision('amount_usd'),
    valuationUsd: doublePrecision('valuation_usd'),
    announcedOn: date('announced_on', { mode: 'string' }).notNull(),
    notes: text('notes'),
    /** The importer's identity for this round, so a re-import updates rather than duplicates. */
    externalKey: text('external_key').unique(),
    mergedIntoId: integer('merged_into_id').references((): AnyPgColumn => fundingRounds.id, {
      onDelete: 'set null',
    }),
    ...curated(),
  },
  (t) => [
    index('rounds_project_idx').on(t.projectId),
    index('rounds_date_idx').on(t.announcedOn),
    check('rounds_amount_positive', sql`${t.amountUsd} is null or ${t.amountUsd} > 0`),
  ],
);

export const tokens = pgTable(
  'tokens',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    mint: text('mint').notNull().unique(),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
    symbol: text('symbol'),
    name: text('name'),
    decimals: integer('decimals'),
    /** `spl` or `token-2022`. */
    standard: text('standard'),
    logoUrl: text('logo_url'),
    coingeckoId: text('coingecko_id'),
    /** The token a project is known by, when it has several. */
    isPrimary: boolean('is_primary').notNull().default(false),
    launchedAt: stamp('launched_at'),
    ...curated(),
  },
  (t) => [index('tokens_project_idx').on(t.projectId)],
);

export const programs = pgTable('programs', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  address: text('address').notNull().unique(),
  name: text('name'),
  /** What the program does, in a word: "AMM", "Lending", "Perpetuals". */
  kind: text('kind'),
  description: text('description'),
  /** `upgradeable`, `immutable` or `unknown` — read from the chain. */
  loader: text('loader'),
  upgradeAuthority: text('upgrade_authority'),
  programDataAddress: text('program_data_address'),
  lastDeploySlot: bigint('last_deploy_slot', { mode: 'number' }),
  onchainCheckedAt: stamp('onchain_checked_at'),
  /** Whether the deployed bytecode was reproduced from public source. */
  verifiedBuild: boolean('verified_build'),
  verifiedRepo: text('verified_repo'),
  verifiedCommit: text('verified_commit'),
  verifiedAt: stamp('verified_at'),
  ...curated(),
});

export const sources = pgTable(
  'sources',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    url: text('url').notNull().unique(),
    title: text('title'),
    /** Who published it: "DefiLlama", "The Block", "jup.ag". */
    publisher: text('publisher'),
    kind: text('kind').$type<SourceKind>().notNull(),
    publishedAt: stamp('published_at'),
    firstSeenAt: stamp('first_seen_at').notNull().defaultNow(),
    /** Last time the link itself was requested, and what it answered. */
    linkCheckedAt: stamp('link_checked_at'),
    httpStatus: integer('http_status'),
    reviewStatus: text('review_status').$type<SourceReview>().notNull().default('unreviewed'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: stamp('reviewed_at'),
    notes: text('notes'),
  },
  (t) => [index('sources_kind_idx').on(t.kind)],
);

export const news = pgTable(
  'news',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    url: text('url').notNull().unique(),
    title: text('title').notNull(),
    publisher: text('publisher').notNull(),
    publishedAt: stamp('published_at').notNull(),
    summary: text('summary'),
    imageUrl: text('image_url'),
    feedUrl: text('feed_url'),
    fetchedAt: stamp('fetched_at').notNull().defaultNow(),
    hidden: boolean('hidden').notNull().default(false),
  },
  (t) => [index('news_published_idx').on(t.publishedAt)],
);

export const events = pgTable(
  'events',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    slug: text('slug').notNull().unique(),
    kind: text('kind').$type<EventKind>().notNull(),
    title: text('title').notNull(),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }),
    url: text('url'),
    location: text('location'),
    description: text('description'),
    /** USD, for incidents. */
    amountUsd: doublePrecision('amount_usd'),
    externalKey: text('external_key').unique(),
    ...curated(),
  },
  (t) => [index('events_starts_idx').on(t.startsOn)],
);

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

/** A person works (or worked) at a project. */
export const projectPeople = pgTable(
  'project_people',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    isCurrent: boolean('is_current').notNull().default(true),
    startedOn: date('started_on', { mode: 'string' }),
    endedOn: date('ended_on', { mode: 'string' }),
    ...linked(),
  },
  (t) => [
    unique('project_people_unique').on(t.projectId, t.personId, t.role),
    index('project_people_person_idx').on(t.personId),
  ],
);

/** A person works (or worked) at an organisation. */
export const organizationPeople = pgTable(
  'organization_people',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    isCurrent: boolean('is_current').notNull().default(true),
    startedOn: date('started_on', { mode: 'string' }),
    endedOn: date('ended_on', { mode: 'string' }),
    ...linked(),
  },
  (t) => [
    unique('organization_people_unique').on(t.organizationId, t.personId, t.role),
    index('organization_people_person_idx').on(t.personId),
  ],
);

/** An investor — an organisation or a person — joined a funding round. */
export const roundInvestors = pgTable(
  'round_investors',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    roundId: integer('round_id')
      .notNull()
      .references(() => fundingRounds.id, { onDelete: 'cascade' }),
    organizationId: integer('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    personId: integer('person_id').references(() => people.id, { onDelete: 'cascade' }),
    isLead: boolean('is_lead').notNull().default(false),
    /** The name exactly as the source printed it. */
    nameAsReported: text('name_as_reported'),
    ...linked(),
  },
  (t) => [
    check(
      'round_investors_one_party',
      sql`(${t.organizationId} is null) <> (${t.personId} is null)`,
    ),
    uniqueIndex('round_investors_org_unique')
      .on(t.roundId, t.organizationId)
      .where(sql`${t.organizationId} is not null`),
    uniqueIndex('round_investors_person_unique')
      .on(t.roundId, t.personId)
      .where(sql`${t.personId} is not null`),
    index('round_investors_org_idx').on(t.organizationId),
    index('round_investors_person_idx').on(t.personId),
  ],
);

/** A project operates or uses a Solana program. */
export const projectPrograms = pgTable(
  'project_programs',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    programId: integer('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    relation: text('relation').$type<ProgramRelation>().notNull().default('operates'),
    note: text('note'),
    ...linked(),
  },
  (t) => [
    unique('project_programs_unique').on(t.projectId, t.programId),
    index('project_programs_program_idx').on(t.programId),
  ],
);

/** A news item mentions a record. */
export const newsMentions = pgTable(
  'news_mentions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    newsId: integer('news_id')
      .notNull()
      .references(() => news.id, { onDelete: 'cascade' }),
    subjectType: text('subject_type').$type<SubjectType>().notNull(),
    subjectId: integer('subject_id').notNull(),
    /** How the mention was found: `title`, `summary` (automatic) or `editor`. */
    matchedBy: text('matched_by').notNull(),
    ...linked(),
  },
  (t) => [
    unique('news_mentions_unique').on(t.newsId, t.subjectType, t.subjectId),
    index('news_mentions_subject_idx').on(t.subjectType, t.subjectId),
  ],
);

/** An event concerns a record. */
export const eventLinks = pgTable(
  'event_links',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    subjectType: text('subject_type').$type<SubjectType>().notNull(),
    subjectId: integer('subject_id').notNull(),
    /**
     * `null` when the source itself ties the event to the record (DefiLlama
     * lists the incident under the protocol); `name` when it was matched by
     * name — a suggestion, shown as one until an editor confirms it.
     */
    matchedBy: text('matched_by'),
    ...linked(),
  },
  (t) => [
    unique('event_links_unique').on(t.eventId, t.subjectType, t.subjectId),
    index('event_links_subject_idx').on(t.subjectType, t.subjectId),
  ],
);

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/**
 * Why we believe something. One row per (thing, field, source).
 *
 * `field` is empty for the record or relationship as a whole ("this person
 * works at this project"), or names one field ("this round's amount").
 */
export const evidence = pgTable(
  'evidence',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    subjectType: text('subject_type').$type<SubjectType>().notNull(),
    subjectId: integer('subject_id').notNull(),
    field: text('field').notNull().default(''),
    sourceId: integer('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    method: text('method').$type<EvidenceMethod>().notNull(),
    checkedAt: stamp('checked_at').notNull().defaultNow(),
    checkedBy: text('checked_by').notNull(),
    note: text('note'),
  },
  (t) => [
    unique('evidence_unique').on(t.subjectType, t.subjectId, t.field, t.sourceId),
    index('evidence_subject_idx').on(t.subjectType, t.subjectId),
    index('evidence_source_idx').on(t.sourceId),
  ],
);

// ---------------------------------------------------------------------------
// Market and on-chain snapshots
// ---------------------------------------------------------------------------

/** A token's market as one provider reported it at one moment. */
export const marketSnapshots = pgTable(
  'market_snapshots',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    tokenId: integer('token_id')
      .notNull()
      .references(() => tokens.id, { onDelete: 'cascade' }),
    capturedAt: stamp('captured_at').notNull().defaultNow(),
    price: doublePrecision('price'),
    marketCap: doublePrecision('market_cap'),
    fdv: doublePrecision('fdv'),
    volume24h: doublePrecision('volume_24h'),
    liquidity: doublePrecision('liquidity'),
    holders: integer('holders'),
    change24h: doublePrecision('change_24h'),
    provider: text('provider').notNull(),
    /** The provider's own timestamp for these numbers, when it gives one. */
    providerUpdatedAt: stamp('provider_updated_at'),
  },
  (t) => [index('market_snapshots_token_idx').on(t.tokenId, t.capturedAt)],
);

/** A project's value locked, fees and revenue as DefiLlama reported them at one moment. */
export const projectMetrics = pgTable(
  'project_metrics',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    capturedAt: stamp('captured_at').notNull().defaultNow(),
    tvlSolana: doublePrecision('tvl_solana'),
    tvlTotal: doublePrecision('tvl_total'),
    tvlChange1d: doublePrecision('tvl_change_1d'),
    tvlChange7d: doublePrecision('tvl_change_7d'),
    fees30d: doublePrecision('fees_30d'),
    revenue30d: doublePrecision('revenue_30d'),
    /** Per product line, when the project ships several. */
    products:
      jsonb('products').$type<{ name: string; category: string | null; tvl: number | null }[]>(),
    provider: text('provider').notNull(),
  },
  (t) => [index('project_metrics_project_idx').on(t.projectId, t.capturedAt)],
);

/**
 * A program's recent activity, estimated from its latest transaction
 * signatures. Always an estimate: a sample of signatures says how busy the
 * program was while they were written, not what it does in a day.
 */
export const programActivity = pgTable(
  'program_activity',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    programId: integer('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    capturedAt: stamp('captured_at').notNull().defaultNow(),
    sampleSize: integer('sample_size').notNull(),
    /**
     * Seconds the rate is measured over: from the oldest sampled signature —
     * or the node's history start, when the sample holds all of it — to when
     * the sample was taken.
     */
    windowSeconds: doublePrecision('window_seconds'),
    txPerHour: doublePrecision('tx_per_hour'),
    failedShare: doublePrecision('failed_share'),
    latestTxAt: stamp('latest_tx_at'),
    provider: text('provider').notNull(),
    method: text('method').notNull(),
  },
  (t) => [index('program_activity_program_idx').on(t.programId, t.capturedAt)],
);

// ---------------------------------------------------------------------------
// Upkeep
// ---------------------------------------------------------------------------

/** Other names a record answers to — so a merged duplicate's name keeps resolving. */
export const aliases = pgTable(
  'aliases',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    subjectType: text('subject_type').$type<SubjectType>().notNull(),
    subjectId: integer('subject_id').notNull(),
    /** Normalised: see `normalizeName`. */
    alias: text('alias').notNull(),
  },
  (t) => [
    unique('aliases_unique').on(t.subjectType, t.alias),
    index('aliases_subject_idx').on(t.subjectType, t.subjectId),
  ],
);

/** Every change to the database, by whom, and why. */
export const changes = pgTable(
  'changes',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    at: stamp('at').notNull().defaultNow(),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    subjectType: text('subject_type').$type<SubjectType>(),
    subjectId: integer('subject_id'),
    summary: text('summary').notNull(),
    diff: jsonb('diff').$type<Record<string, { from: unknown; to: unknown }>>(),
  },
  (t) => [
    index('changes_at_idx').on(t.at),
    index('changes_subject_idx').on(t.subjectType, t.subjectId),
  ],
);

export const importRuns = pgTable(
  'import_runs',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    job: text('job').notNull(),
    startedAt: stamp('started_at').notNull().defaultNow(),
    finishedAt: stamp('finished_at'),
    /** `running`, `ok`, `partial` or `error`. */
    status: text('status').notNull(),
    stats: jsonb('stats').$type<Record<string, number>>(),
    error: text('error'),
  },
  (t) => [index('import_runs_job_idx').on(t.job, t.startedAt)],
);

/** When a job last processed a given record — so batch jobs work through the stalest first. */
export const syncState = pgTable(
  'sync_state',
  {
    job: text('job').notNull(),
    subjectType: text('subject_type').$type<SubjectType>().notNull(),
    subjectId: integer('subject_id').notNull(),
    syncedAt: stamp('synced_at').notNull().defaultNow(),
    ok: boolean('ok').notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.job, t.subjectType, t.subjectId] })],
);

/** Pairs an editor has said are not duplicates. */
export const distinctPairs = pgTable(
  'distinct_pairs',
  {
    subjectType: text('subject_type').$type<SubjectType>().notNull(),
    aId: integer('a_id').notNull(),
    bId: integer('b_id').notNull(),
    decidedBy: text('decided_by').notNull(),
    decidedAt: stamp('decided_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.subjectType, t.aId, t.bId] })],
);
