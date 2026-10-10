/**
 * Funding rounds, investors and dated events, from DefiLlama.
 *
 * Every round here comes from a funding database entry that points at an
 * announcement — the round's `source` link — and is evidenced by both. No
 * round is ever created from on-chain activity.
 *
 * Without a paid key this works through projects in batches, stalest first:
 * DefiLlama publishes each project's rounds with its record, free, but the
 * global feed is paid. With `DEFILLAMA_API_KEY` the complete feed is read in
 * one request, which also reaches projects with no value locked.
 *
 * Investors arrive as bare names. A name resolves to an existing person or
 * organisation through aliases (which survive merges); an unknown name becomes
 * a new record, guessed to be a person or an organisation from how it is
 * written — a guess, so it is recorded as one and sent to review.
 */

import { DefiLlamaSolana, mapSettledLimit } from '@marketroom/adapters';
import {
  canonicalUrl,
  classifySource,
  formatCompactUsd,
  guessParty,
  normalizeName,
  normalizeRoundType,
  toSlug,
  uniqueSlug,
  type FundingRound,
  type ProjectDetail,
} from '@marketroom/core';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { rows } from '../client';
import { inList } from '../read/common';
import {
  eventLinks,
  events,
  FUNDING_SOURCE_KINDS,
  fundingRounds,
  organizations,
  people,
  projects,
  roundInvestors,
  syncState,
  type SourceKind,
} from '../schema';
import {
  addAliases,
  aliasIndex,
  recordChanges,
  takenSlugs,
  unlockedSet,
  upsertEvidence,
  upsertSources,
  type ChangeInput,
  type EvidenceInput,
} from '../write';
import { isoDay, type JobContext, type JobResult } from './context';
import { defillamaPage } from './projects';

const JOB = 'funding';

interface Target {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly key: string;
}

/**
 * Investor names this importer once read as people that the current rules
 * read as firms — "Ark Invest", "Forward Industries" — become organisations.
 * Only guesses qualify: still awaiting review, never touched or locked by an
 * editor, and tied to the database by nothing but rounds. An existing firm
 * of the same name absorbs the links instead of gaining a twin.
 */
export async function reclassifyGuessedPeople(ctx: JobContext): Promise<number> {
  const { db } = ctx;
  const candidates = await rows<{ id: number; name: string }>(
    db,
    sql`select pe.id, pe.name from people pe
        where pe.merged_into_id is null and pe.review_status = 'needs_review'
          and cardinality(pe.locked_fields) = 0
          and not exists (select 1 from evidence e
            where e.subject_type = 'person' and e.subject_id = pe.id and e.method = 'editor')
          and not exists (select 1 from project_people pp where pp.person_id = pe.id)
          and not exists (select 1 from organization_people op where op.person_id = pe.id)`,
  );
  const firms = candidates.filter((c) => guessParty(c.name) === 'organization');
  if (firms.length === 0) return 0;

  const taken = await takenSlugs(db, 'organizations');
  const changes: ChangeInput[] = [];
  for (const c of firms) {
    const orgId = await db.transaction(async (tx) => {
      const [existing] = await rows<{ id: number }>(
        tx,
        sql`select o.id from aliases a
            join organizations o on o.id = a.subject_id and o.merged_into_id is null and o.review_status <> 'rejected'
            where a.subject_type = 'organization' and a.alias = ${normalizeName(c.name)} limit 1`,
      );
      let id = existing?.id;
      if (!id) {
        const slug = uniqueSlug(c.name, (x) => taken.has(x));
        taken.add(slug);
        const [row] = await tx
          .insert(organizations)
          .values({ slug, name: c.name.trim(), isInvestor: true })
          .returning({ id: organizations.id });
        id = row!.id;
      }
      // A round names a party once: drop links the firm already has.
      const dupes = (
        await rows<{ id: number }>(
          tx,
          sql`select ri.id from round_investors ri where ri.person_id = ${c.id}
              and exists (select 1 from round_investors x where x.round_id = ri.round_id and x.organization_id = ${id})`,
        )
      ).map((d) => d.id);
      if (dupes.length) {
        await tx.execute(
          sql`delete from evidence where subject_type = 'round_investor' and subject_id in ${inList(dupes)}`,
        );
        await tx.execute(sql`delete from round_investors where id in ${inList(dupes)}`);
      }
      await tx.execute(
        sql`update round_investors set organization_id = ${id}, person_id = null where person_id = ${c.id}`,
      );
      // The guess that made this a person no longer stands; other sources move across.
      await tx.execute(
        sql`delete from evidence e where e.subject_type = 'person' and e.subject_id = ${c.id}
            and (e.method = 'inferred' or exists (select 1 from evidence x
              where x.subject_type = 'organization' and x.subject_id = ${id}
                and x.field is not distinct from e.field and x.source_id = e.source_id))`,
      );
      await tx.execute(
        sql`update evidence set subject_type = 'organization', subject_id = ${id}
            where subject_type = 'person' and subject_id = ${c.id}`,
      );
      await tx.execute(
        sql`delete from aliases where subject_type = 'person' and subject_id = ${c.id}`,
      );
      await addAliases(tx, 'organization', [{ subjectId: id, name: c.name }]);
      await tx.execute(
        sql`update people set review_status = 'rejected', updated_at = now() where id = ${c.id}`,
      );
      return id;
    });
    changes.push({
      actor: ctx.actor,
      action: 'record.converted',
      subjectType: 'organization',
      subjectId: orgId,
      summary: `Read “${c.name.trim()}” as an organisation rather than a person`,
    });
  }
  await recordChanges(db, changes);
  return firms.length;
}

/** Projects due for a funding pass: never synced first, then the stalest. */
async function dueProjects(ctx: JobContext, limit: number): Promise<Target[]> {
  return rows<Target>(
    ctx.db,
    sql`
      select p.id, p.slug, p.name, p.defillama_key as key
      from ${projects} p
      left join ${syncState} s
        on s.job = ${JOB} and s.subject_type = 'project' and s.subject_id = p.id
      left join lateral (
        select tvl_solana from project_metrics m
        where m.project_id = p.id order by m.captured_at desc limit 1
      ) m on true
      where p.defillama_key is not null and p.merged_into_id is null and p.review_status <> 'rejected'
      order by s.synced_at asc nulls first, m.tvl_solana desc nulls last
      limit ${limit}`,
  );
}

export async function syncFunding(ctx: JobContext): Promise<JobResult> {
  const llama = new DefiLlamaSolana({ signal: ctx.signal });
  const batch = await dueProjects(ctx, ctx.bootstrap ? 260 : 90);
  ctx.log(`Funding pass over ${batch.length} projects`);

  const settled = await mapSettledLimit(batch, 4, (p) => llama.detail(p.key));
  const details: { project: Target; detail: ProjectDetail }[] = [];
  let failed = 0;
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') details.push({ project: batch[i]!, detail: r.value });
    else failed += 1;
  });

  const reclassified = await reclassifyGuessedPeople(ctx);
  if (reclassified) ctx.log(`Read ${reclassified} investor names as firms, not people`);

  const writer = new FundingWriter(ctx);
  await writer.load();

  let rounds = 0;
  if (ctx.env.defillamaKey) {
    rounds += await writer.writeProFeed(llama, ctx.env.defillamaKey);
  }
  for (const { project, detail } of details) {
    if (!ctx.env.defillamaKey) rounds += await writer.writeRounds(project, detail.rounds);
    await writer.writeEvents(project, detail);
  }

  // Remember who was processed, so the next pass starts with someone else.
  const processed = new Set(details.map((d) => d.project.id));
  for (const p of batch) {
    await ctx.db
      .insert(syncState)
      .values({
        job: JOB,
        subjectType: 'project',
        subjectId: p.id,
        syncedAt: ctx.now,
        ok: processed.has(p.id),
      })
      .onConflictDoUpdate({
        target: [syncState.job, syncState.subjectType, syncState.subjectId],
        set: { syncedAt: ctx.now, ok: processed.has(p.id) },
      });
  }

  // Anyone who has joined a round is an investor.
  await ctx.db.execute(sql`
    update ${organizations} set is_investor = true
    where not is_investor and id in (select organization_id from ${roundInvestors} where organization_id is not null)`);

  await recordChanges(ctx.db, writer.changes);
  return {
    stats: { projects: batch.length, failed, rounds, reclassified, ...writer.stats },
    partial: failed > 0 && failed < batch.length,
  };
}

class FundingWriter {
  readonly changes: ChangeInput[] = [];
  readonly stats = { roundsCreated: 0, investorsCreated: 0, peopleGuessed: 0, events: 0 };
  private orgByName = new Map<string, number>();
  private personByName = new Map<string, number>();
  private takenOrg = new Set<string>();
  private takenPerson = new Set<string>();
  private takenRound = new Set<string>();
  private takenEvent = new Set<string>();

  constructor(private readonly ctx: JobContext) {}

  async load() {
    const { db } = this.ctx;
    this.orgByName = await aliasIndex(db, 'organization');
    this.personByName = await aliasIndex(db, 'person');
    this.takenOrg = await takenSlugs(db, 'organizations');
    this.takenPerson = await takenSlugs(db, 'people');
    this.takenRound = await takenSlugs(db, 'funding_rounds');
    this.takenEvent = await takenSlugs(db, 'events');
  }

  /** The complete feed, when a paid key is configured. */
  async writeProFeed(llama: DefiLlamaSolana, key: string): Promise<number> {
    const { db } = this.ctx;
    const all = await db
      .select({
        id: projects.id,
        slug: projects.slug,
        name: projects.name,
        key: projects.defillamaKey,
        ids: projects.defillamaIds,
      })
      .from(projects)
      .where(and(isNotNull(projects.defillamaKey), isNull(projects.mergedIntoId)));
    const byLlamaId = new Map<string, Target>();
    for (const p of all)
      for (const id of p.ids)
        byLlamaId.set(id, { id: p.id, slug: p.slug, name: p.name, key: p.key! });
    const feed = await llama.proRaises(key, (id) => (id ? (byLlamaId.get(id)?.key ?? null) : null));
    const byProject = new Map<string, FundingRound[]>();
    for (const r of feed) {
      if (!r.projectSlug) continue;
      byProject.set(r.projectSlug, [...(byProject.get(r.projectSlug) ?? []), r]);
    }
    let count = 0;
    for (const [projectKey, list] of byProject) {
      const target = all.find((p) => p.key === projectKey);
      if (target)
        count += await this.writeRounds(
          { id: target.id, slug: target.slug, name: target.name, key: projectKey },
          list,
        );
    }
    return count;
  }

  async writeRounds(project: Target, list: readonly FundingRound[]): Promise<number> {
    if (list.length === 0) return 0;
    const { db } = this.ctx;

    // One row per (date, type) — family members often repeat the same raise.
    const unique = new Map<string, FundingRound>();
    for (const r of list) {
      const key = `llama:${project.key}:${isoDay(r.date)}:${normalizeRoundType(r.round) ?? 'na'}`;
      if (!unique.has(key)) unique.set(key, r);
    }

    const existing = new Set(
      (
        await db
          .select({ key: fundingRounds.externalKey })
          .from(fundingRounds)
          .where(inArray(fundingRounds.externalKey, [...unique.keys()]))
      ).map((r) => r.key),
    );

    const values = [...unique.entries()].map(([externalKey, r]) => {
      const roundType = normalizeRoundType(r.round);
      const day = isoDay(r.date);
      let slug = '';
      if (!existing.has(externalKey)) {
        slug = uniqueSlug(`${project.slug}-${roundType ?? 'round'}-${day.slice(0, 7)}`, (s) =>
          this.takenRound.has(s),
        );
        this.takenRound.add(slug);
      }
      return {
        slug: slug || `pending-${externalKey}`,
        projectId: project.id,
        roundType,
        amountUsd: r.amount,
        valuationUsd: r.valuation,
        announcedOn: day,
        externalKey,
      };
    });
    const saved = await db
      .insert(fundingRounds)
      .values(values)
      .onConflictDoUpdate({
        target: fundingRounds.externalKey,
        set: {
          ...unlockedSet(fundingRounds, fundingRounds as never, [
            'roundType',
            'amountUsd',
            'valuationUsd',
            'announcedOn',
          ]),
          updatedAt: sql`now()`,
        },
        setWhere: sql`${fundingRounds.reviewStatus} <> 'rejected' and ${fundingRounds.mergedIntoId} is null`,
      })
      .returning({ id: fundingRounds.id, externalKey: fundingRounds.externalKey });
    const idByKey = new Map(saved.map((s) => [s.externalKey!, s.id]));
    // Rounds kept as tombstones are not returned and get nothing new attached.

    // Sources: the project's DefiLlama page, and each round's announcement.
    const llamaUrl = defillamaPage(project.key);
    const announcement = (r: FundingRound): { url: string; kind: SourceKind } | null => {
      if (!r.source) return null;
      const kind = classifySource(r.source).kind;
      // The link DefiLlama gives *is* the announcement; a generic site is the
      // project's own post. An explorer link is not an announcement at all.
      const asKind: SourceKind | null =
        kind === 'website' || kind === 'repository'
          ? 'announcement'
          : FUNDING_SOURCE_KINDS.includes(kind)
            ? kind
            : null;
      return asKind ? { url: r.source, kind: asKind } : null;
    };
    const sourceIds = await upsertSources(db, [
      {
        url: llamaUrl,
        title: `${project.name} on DefiLlama`,
        publisher: 'DefiLlama',
        kind: 'database',
      },
      ...[...unique.values()]
        .map(announcement)
        .filter((a): a is { url: string; kind: SourceKind } => a !== null),
    ]);
    const llamaId = sourceIds.get(llamaUrl)!;

    const ev: EvidenceInput[] = [];
    let created = 0;
    for (const [externalKey, r] of unique) {
      const roundId = idByKey.get(externalKey);
      if (!roundId) continue;
      const a = announcement(r);
      const srcs = [llamaId, ...(a ? [sourceIds.get(canonicalUrl(a.url))!] : [])].filter(Boolean);
      for (const sourceId of srcs) {
        const base = {
          subjectType: 'round' as const,
          subjectId: roundId,
          sourceId,
          checkedBy: this.ctx.actor,
          method: 'imported' as const,
        };
        ev.push(base, { ...base, field: 'announcedOn' });
        if (r.amount !== null) ev.push({ ...base, field: 'amountUsd' });
        if (r.round) ev.push({ ...base, field: 'roundType' });
        if (r.valuation !== null) ev.push({ ...base, field: 'valuationUsd' });
      }

      if (!existing.has(externalKey)) {
        created += 1;
        if (!this.ctx.bootstrap) {
          this.changes.push({
            actor: this.ctx.actor,
            action: 'round.added',
            subjectType: 'round',
            subjectId: roundId,
            summary: `${project.name} — ${normalizeRoundType(r.round) ?? 'round'}${r.amount ? `, ${formatCompactUsd(r.amount)}` : ''}`,
          });
        }
      }

      // Investors.
      const parties = [
        ...r.leadInvestors.map((name) => ({ name, lead: true })),
        ...r.otherInvestors.map((name) => ({ name, lead: false })),
      ];
      const seen = new Set<string>();
      for (const party of parties) {
        const norm = normalizeName(party.name);
        if (!norm || seen.has(norm)) continue;
        seen.add(norm);
        const resolved = await this.resolveParty(party.name, llamaId);
        const [link] = await db
          .insert(roundInvestors)
          .values({
            roundId,
            organizationId: resolved.type === 'organization' ? resolved.id : null,
            personId: resolved.type === 'person' ? resolved.id : null,
            isLead: party.lead,
            nameAsReported: party.name,
          })
          .onConflictDoNothing()
          .returning({ id: roundInvestors.id });
        const linkId =
          link?.id ??
          (
            await db
              .select({ id: roundInvestors.id })
              .from(roundInvestors)
              .where(
                and(
                  eq(roundInvestors.roundId, roundId),
                  resolved.type === 'organization'
                    ? eq(roundInvestors.organizationId, resolved.id)
                    : eq(roundInvestors.personId, resolved.id),
                ),
              )
              .limit(1)
          )[0]?.id;
        if (!linkId) continue;
        for (const sourceId of srcs) {
          ev.push({
            subjectType: 'round_investor',
            subjectId: linkId,
            sourceId,
            method: 'imported',
            checkedBy: this.ctx.actor,
          });
        }
      }
    }
    await upsertEvidence(db, ev);
    this.stats.roundsCreated += created;
    return unique.size;
  }

  private async resolveParty(
    name: string,
    sourceId: number,
  ): Promise<{ type: 'organization' | 'person'; id: number }> {
    const { db } = this.ctx;
    const norm = normalizeName(name);
    const org = this.orgByName.get(norm);
    if (org) return { type: 'organization', id: org };
    const person = this.personByName.get(norm);
    if (person) return { type: 'person', id: person };

    if (guessParty(name) === 'person') {
      const slug = uniqueSlug(name, (s) => this.takenPerson.has(s));
      this.takenPerson.add(slug);
      const [row] = await db
        .insert(people)
        .values({ slug, name: name.trim(), reviewStatus: 'needs_review' })
        .returning({ id: people.id });
      this.personByName.set(norm, row!.id);
      await addAliases(db, 'person', [{ subjectId: row!.id, name }]);
      await upsertEvidence(db, [
        {
          subjectType: 'person',
          subjectId: row!.id,
          sourceId,
          method: 'inferred',
          checkedBy: this.ctx.actor,
          note: 'Listed as an investor by name; read as a person from how the name is written. Confirm or convert.',
        },
      ]);
      this.stats.peopleGuessed += 1;
      this.logNew('person', row!.id, `New angel investor: ${name.trim()}`);
      return { type: 'person', id: row!.id };
    }

    const slug = uniqueSlug(name, (s) => this.takenOrg.has(s));
    this.takenOrg.add(slug);
    const [row] = await db
      .insert(organizations)
      .values({ slug, name: name.trim(), isInvestor: true })
      .returning({ id: organizations.id });
    this.orgByName.set(norm, row!.id);
    await addAliases(db, 'organization', [{ subjectId: row!.id, name }]);
    await upsertEvidence(db, [
      {
        subjectType: 'organization',
        subjectId: row!.id,
        sourceId,
        method: 'imported',
        checkedBy: this.ctx.actor,
        note: 'Named as an investor in a funding round.',
      },
    ]);
    this.stats.investorsCreated += 1;
    this.logNew('organization', row!.id, `New investor: ${name.trim()}`);
    return { type: 'organization', id: row!.id };
  }

  private logNew(type: 'person' | 'organization', id: number, summary: string) {
    if (this.ctx.bootstrap) return;
    this.changes.push({
      actor: this.ctx.actor,
      action: `${type}.added`,
      subjectType: type,
      subjectId: id,
      summary,
    });
  }

  /** Dated milestones and security incidents DefiLlama records for the project. */
  async writeEvents(project: Target, detail: ProjectDetail) {
    const { db } = this.ctx;
    const items = [
      ...detail.events.map((e) => ({
        kind: 'milestone' as const,
        title: e.label,
        day: isoDay(e.date),
        amountUsd: null as number | null,
      })),
      ...detail.hacks
        .filter((h) => h.date > 0)
        .map((h) => ({
          kind: 'incident' as const,
          title: h.classification ? `Security incident: ${h.classification}` : 'Security incident',
          day: isoDay(h.date),
          amountUsd: h.amount,
        })),
    ];
    if (items.length === 0) return;
    const llamaUrl = defillamaPage(project.key);
    const sourceIds = await upsertSources(db, [
      {
        url: llamaUrl,
        title: `${project.name} on DefiLlama`,
        publisher: 'DefiLlama',
        kind: 'database',
      },
    ]);
    const sourceId = sourceIds.get(llamaUrl)!;
    const ev: EvidenceInput[] = [];
    for (const item of items) {
      const externalKey = `llama:${project.key}:${item.kind}:${item.day}:${toSlug(item.title).slice(0, 48)}`;
      const slug = uniqueSlug(`${project.slug}-${item.title.slice(0, 40)}-${item.day}`, (s) =>
        this.takenEvent.has(s),
      );
      const [saved] = await db
        .insert(events)
        .values({
          slug,
          kind: item.kind,
          title: item.title,
          startsOn: item.day,
          amountUsd: item.amountUsd,
          externalKey,
        })
        .onConflictDoUpdate({
          target: events.externalKey,
          set: unlockedSet(events, events as never, ['title', 'amountUsd']),
          setWhere: sql`${events.reviewStatus} <> 'rejected'`,
        })
        .returning({ id: events.id, slug: events.slug });
      if (!saved) continue;
      if (saved.slug === slug) this.takenEvent.add(slug);
      await db
        .insert(eventLinks)
        .values({ eventId: saved.id, subjectType: 'project', subjectId: project.id })
        .onConflictDoNothing();
      ev.push({
        subjectType: 'event',
        subjectId: saved.id,
        sourceId,
        method: 'imported',
        checkedBy: this.ctx.actor,
      });
      this.stats.events += 1;
    }
    await upsertEvidence(db, ev);
  }
}
