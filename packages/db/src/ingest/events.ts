/**
 * Dated events: Solana community events from solana.com, and security
 * incidents from DefiLlama's hacks database.
 *
 * Community events — conferences, hackathons, meetups — are read from the
 * structured data solana.com publishes, cited to that page, and linked to
 * the projects and organisations their names mention. A cancelled event is
 * not imported; one already imported is marked as cancelled in its title.
 *
 * Incidents are linked to the project whose DefiLlama ids include the
 * victim's. The funding job imports the same incidents from each project's
 * DefiLlama record, so a matched incident is keyed exactly as it keys them —
 * the two jobs refresh one event rather than create two. An incident whose
 * victim we do not track is still a Solana incident, and is kept unlinked.
 */

import {
  DefiLlamaSolana,
  SOLANA_EVENTS_PAGE,
  SolanaEvents,
  type CommunityEvent,
  type SolanaHack,
} from '@marketroom/adapters';
import { canonicalUrl, formatCompactUsd, toSlug, uniqueSlug } from '@marketroom/core';
import { and, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { eventLinks, events, projects, type EventKind } from '../schema';
import {
  takenSlugs,
  unlockedSet,
  upsertEvidence,
  upsertSources,
  type EvidenceInput,
} from '../write';
import { isoDay, type JobContext, type JobResult } from './context';
import { mentionCandidates, mentionMatcher } from './news';

const HACKS_PAGE = 'https://defillama.com/hacks';

/** Hackathons, and the hacker houses held around them; everything else on the page is a gathering. */
export const communityEventKind = (name: string): EventKind =>
  /hackathon|hacker\s*house|buildathon/i.test(name) ? 'hackathon' : 'conference';

/** The funding job's key for a DefiLlama incident — kept identical so both jobs write one event. */
export const incidentTitle = (classification: string | null) =>
  classification ? `Security incident: ${classification}` : 'Security incident';
export const incidentKey = (projectKey: string, day: string, title: string) =>
  `llama:${projectKey}:incident:${day}:${toSlug(title).slice(0, 48)}`;

export async function syncEvents(ctx: JobContext): Promise<JobResult> {
  const [community, hacks] = await Promise.allSettled([
    new SolanaEvents({ signal: ctx.signal }).list(),
    new DefiLlamaSolana({ signal: ctx.signal }).hacks(),
  ]);
  if (community.status === 'rejected' && hacks.status === 'rejected') throw community.reason;
  if (community.status === 'rejected')
    ctx.log(`solana.com/events unavailable: ${String(community.reason)}`);
  if (hacks.status === 'rejected') ctx.log(`DefiLlama hacks unavailable: ${String(hacks.reason)}`);

  const writer = new EventWriter(ctx);
  await writer.load();
  if (community.status === 'fulfilled') await writer.community(community.value);
  if (hacks.status === 'fulfilled') await writer.incidents(hacks.value);
  await writer.flush();
  return {
    stats: writer.stats,
    partial: community.status === 'rejected' || hacks.status === 'rejected',
  };
}

interface ProjectRow {
  id: number;
  slug: string;
  key: string;
  ids: string[];
}

class EventWriter {
  readonly stats = {
    communityEvents: 0,
    cancelled: 0,
    incidents: 0,
    incidentsLinked: 0,
    links: 0,
  };
  private taken = new Set<string>();
  private ev: EvidenceInput[] = [];

  constructor(private readonly ctx: JobContext) {}

  async load() {
    this.taken = await takenSlugs(this.ctx.db, 'events');
  }

  private async sourceId(
    url: string,
    title: string,
    publisher: string,
    kind: 'website' | 'database',
  ) {
    const ids = await upsertSources(this.ctx.db, [{ url, title, publisher, kind }]);
    return ids.get(canonicalUrl(url))!;
  }

  /** Insert or refresh one event by its key; `null` for a tombstone an editor rejected. */
  private async upsert(
    values: typeof events.$inferInsert,
    refreshed: readonly string[],
  ): Promise<{ id: number } | null> {
    const [saved] = await this.ctx.db
      .insert(events)
      .values(values)
      .onConflictDoUpdate({
        target: events.externalKey,
        set: {
          ...unlockedSet(events, events as never, refreshed),
          description: sql`case when 'description' = any(${events.lockedFields}) then ${events.description} else coalesce(excluded.description, ${events.description}) end`,
          updatedAt: sql`now()`,
        },
        setWhere: sql`${events.reviewStatus} <> 'rejected'`,
      })
      .returning({ id: events.id, slug: events.slug });
    if (!saved) return null;
    if (saved.slug === values.slug) this.taken.add(values.slug);
    return saved;
  }

  /**
   * `matchedBy: 'name'` marks a link found by matching names — a suggestion
   * that stays unconfirmed until an editor checks it. A link the source states
   * (DefiLlama files the incident under the protocol) has none.
   */
  private async link(
    eventId: number,
    subjectType: 'project' | 'organization',
    subjectId: number,
    matchedBy: 'name' | null = null,
  ) {
    const inserted = await this.ctx.db
      .insert(eventLinks)
      .values({
        eventId,
        subjectType,
        subjectId,
        matchedBy,
        reviewStatus: matchedBy ? 'needs_review' : 'unreviewed',
      })
      .onConflictDoNothing()
      .returning({ id: eventLinks.id });
    this.stats.links += inserted.length;
  }

  async community(list: readonly CommunityEvent[]) {
    const { db } = this.ctx;
    const sourceId = await this.sourceId(
      SOLANA_EVENTS_PAGE,
      'Solana Events',
      'Solana Foundation',
      'website',
    );
    // Every event on the page is a Solana event, so names count in that context.
    const [projectNames, orgNames] = (
      await Promise.all([mentionCandidates(db, 'project'), mentionCandidates(db, 'organization')])
    ).map(mentionMatcher);

    for (const e of list) {
      const day = isoDay(e.startsAt);
      const externalKey = e.url
        ? `solana-events:${canonicalUrl(e.url)}`
        : `solana-events:${toSlug(e.name)}:${day}`;

      if (e.status === 'cancelled') {
        // Never imported if cancelled first; if already imported, say so where a reader looks.
        await db
          .update(events)
          .set({ title: sql`'Cancelled: ' || ${events.title}`, updatedAt: new Date() })
          .where(
            and(
              eq(events.externalKey, externalKey),
              ne(events.reviewStatus, 'rejected'),
              sql`not ('title' = any(${events.lockedFields}))`,
              sql`${events.title} not like 'Cancelled:%'`,
            ),
          );
        this.stats.cancelled += 1;
        continue;
      }

      const slug = uniqueSlug(`${e.name.slice(0, 60)}-${day}`, (s) => this.taken.has(s));
      const saved = await this.upsert(
        {
          slug,
          kind: communityEventKind(e.name),
          title: e.name,
          startsOn: day,
          endsOn: e.endsAt === null ? null : isoDay(e.endsAt),
          url: e.url,
          location: e.location,
          description: e.description,
          externalKey,
        },
        ['kind', 'title', 'startsOn', 'endsOn', 'url', 'location'],
      );
      if (!saved) continue;
      this.stats.communityEvents += 1;

      const base = {
        subjectType: 'event' as const,
        subjectId: saved.id,
        sourceId,
        method: 'imported' as const,
        checkedBy: this.ctx.actor,
      };
      this.ev.push(base, { ...base, field: 'startsOn' });
      if (e.location) this.ev.push({ ...base, field: 'location' });

      for (const m of projectNames!({ title: e.name }, true))
        await this.link(saved.id, 'project', m.id, 'name');
      for (const m of orgNames!({ title: e.name }, true))
        await this.link(saved.id, 'organization', m.id, 'name');
    }
  }

  async incidents(list: readonly SolanaHack[]) {
    const { db } = this.ctx;
    const sourceId = await this.sourceId(
      HACKS_PAGE,
      'DefiLlama hacks database',
      'DefiLlama',
      'database',
    );
    const tracked = await db
      .select({
        id: projects.id,
        slug: projects.slug,
        key: projects.defillamaKey,
        ids: projects.defillamaIds,
      })
      .from(projects)
      .where(
        and(
          isNotNull(projects.defillamaKey),
          isNull(projects.mergedIntoId),
          ne(projects.reviewStatus, 'rejected'),
        ),
      );
    // Every DefiLlama id a project rolls up — protocol ids and `parent#…` ids alike.
    const byLlamaId = new Map<string, ProjectRow>();
    for (const p of tracked) for (const id of p.ids) byLlamaId.set(id, { ...p, key: p.key! });

    for (const h of list) {
      const project =
        (h.defillamaId ? byLlamaId.get(h.defillamaId) : undefined) ??
        (h.parentProtocolId ? byLlamaId.get(h.parentProtocolId) : undefined) ??
        null;
      const day = isoDay(h.date);
      const title = project ? incidentTitle(h.classification) : `Security incident: ${h.name}`;
      const details = [
        project ? null : h.classification,
        h.technique,
        h.returnedFunds !== null ? `${formatCompactUsd(h.returnedFunds)} returned` : null,
      ].filter((d): d is string => !!d);
      const saved = await this.upsert(
        {
          slug: uniqueSlug(
            project
              ? `${project.slug}-${title.slice(0, 40)}-${day}`
              : `${h.name.slice(0, 40)}-incident-${day}`,
            (s) => this.taken.has(s),
          ),
          kind: 'incident',
          title,
          startsOn: day,
          amountUsd: h.amount,
          description: details.length ? `${details.join('. ')}.` : null,
          externalKey: project
            ? incidentKey(project.key, day, title)
            : `llama-hack:${h.defillamaId ?? toSlug(h.name)}:${day}`,
        },
        ['title', 'amountUsd'],
      );
      if (!saved) continue;
      this.stats.incidents += 1;
      if (project) {
        this.stats.incidentsLinked += 1;
        await this.link(saved.id, 'project', project.id);
      }
      const base = {
        subjectType: 'event' as const,
        subjectId: saved.id,
        sourceId,
        method: 'imported' as const,
        checkedBy: this.ctx.actor,
      };
      this.ev.push(base, { ...base, field: 'startsOn' });
      if (h.amount !== null) this.ev.push({ ...base, field: 'amountUsd' });
    }
  }

  async flush() {
    await upsertEvidence(this.ctx.db, this.ev);
    this.ev = [];
  }
}
