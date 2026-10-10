/**
 * What changed: the calendar of rounds and events, and the update feed that
 * alerts are built from.
 *
 * Updates are the database's own change log — rounds added, people linked,
 * programs mapped, profiles checked by an editor — plus news that mentions a
 * record. A first import writes no change log (see JobContext.bootstrap), so
 * the feed starts with real news rather than ten thousand "added" rows.
 */

import { sql } from 'drizzle-orm';
import { rows, type Executor } from '../client';
import type { ReviewStatus, SubjectType } from '../schema';
import { epoch, inList, type ProjectRef } from './common';

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export interface CalendarRound {
  readonly kind: 'round';
  readonly date: string;
  readonly slug: string;
  readonly roundType: string | null;
  readonly amountUsd: number | null;
  readonly project: ProjectRef;
  readonly leads: readonly string[];
}

export interface CalendarEvent {
  readonly kind: 'event';
  readonly date: string;
  readonly endsOn: string | null;
  readonly slug: string;
  readonly eventKind: string;
  readonly title: string;
  readonly url: string | null;
  readonly location: string | null;
  readonly amountUsd: number | null;
  readonly reviewStatus: ReviewStatus;
  /** `unconfirmed`: tied to the event by matching a name, not by its source. */
  readonly projects: readonly (ProjectRef & { unconfirmed: boolean })[];
}

export type CalendarItem = CalendarRound | CalendarEvent;

export async function loadCalendar(
  db: Executor,
  from: string,
  to: string,
): Promise<CalendarItem[]> {
  const [roundRows, eventRows] = await Promise.all([
    rows<{
      date: string;
      slug: string;
      round_type: string | null;
      amount_usd: number | null;
      project_id: number;
      project_slug: string;
      project_name: string;
      logo_url: string | null;
      category: string | null;
      leads: string[] | null;
    }>(
      db,
      sql`select fr.announced_on::text as date, fr.slug, fr.round_type, fr.amount_usd, p.id as project_id,
            p.slug as project_slug, p.name as project_name, p.logo_url, p.category,
            (select array_agg(coalesce(o.name, pe.name)) from round_investors ri
              left join organizations o on o.id = ri.organization_id
              left join people pe on pe.id = ri.person_id
              where ri.round_id = fr.id and ri.is_lead and ri.review_status <> 'rejected') as leads
          from funding_rounds fr join projects p on p.id = fr.project_id and p.merged_into_id is null
          where fr.merged_into_id is null and fr.review_status <> 'rejected'
            and fr.announced_on between ${from}::date and ${to}::date
          order by fr.announced_on desc`,
    ),
    rows<{
      date: string;
      ends_on: string | null;
      slug: string;
      kind: string;
      title: string;
      url: string | null;
      location: string | null;
      amount_usd: number | null;
      review_status: ReviewStatus;
      projects: (ProjectRef & { unconfirmed: boolean })[] | null;
    }>(
      db,
      sql`select e.starts_on::text as date, e.ends_on::text, e.slug, e.kind, e.title, e.url, e.location,
            e.amount_usd, e.review_status,
            (select jsonb_agg(jsonb_build_object('id', p.id, 'slug', p.slug, 'name', p.name,
                'logoUrl', p.logo_url, 'category', p.category,
                'unconfirmed', l.matched_by is not null and l.review_status <> 'verified')
                order by (l.matched_by is not null and l.review_status <> 'verified'), p.name)
              from event_links l join projects p on p.id = l.subject_id and p.merged_into_id is null
              where l.event_id = e.id and l.subject_type = 'project' and l.review_status <> 'rejected') as projects
          from events e
          where e.review_status <> 'rejected'
            and e.starts_on <= ${to}::date and coalesce(e.ends_on, e.starts_on) >= ${from}::date
          order by e.starts_on desc`,
    ),
  ]);
  const items: CalendarItem[] = [
    ...roundRows.map((r): CalendarRound => ({
      kind: 'round',
      date: r.date,
      slug: r.slug,
      roundType: r.round_type,
      amountUsd: r.amount_usd,
      project: {
        id: r.project_id,
        slug: r.project_slug,
        name: r.project_name,
        logoUrl: r.logo_url,
        category: r.category,
      },
      leads: r.leads ?? [],
    })),
    ...eventRows.map((e): CalendarEvent => ({
      kind: 'event',
      date: e.date,
      endsOn: e.ends_on,
      slug: e.slug,
      eventKind: e.kind,
      title: e.title,
      url: e.url,
      location: e.location,
      amountUsd: e.amount_usd,
      reviewStatus: e.review_status,
      projects: e.projects ?? [],
    })),
  ];
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

/** Events from today on, soonest first. */
export async function loadUpcoming(
  db: Executor,
  today: string,
  limit = 12,
): Promise<CalendarEvent[]> {
  const items = await loadCalendar(db, today, '2999-12-31');
  return items
    .filter((i): i is CalendarEvent => i.kind === 'event')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

export interface WatchKey {
  readonly type: 'project' | 'person' | 'organization';
  readonly slug: string;
}

export interface UpdateItem {
  readonly id: string;
  readonly at: number;
  readonly kind: 'change' | 'news';
  readonly action: string;
  readonly title: string;
  readonly url: string;
  readonly external: boolean;
  readonly subject: { type: SubjectType; slug: string; name: string } | null;
  readonly actor: string | null;
  readonly publisher: string | null;
}

/** Actions shown to readers; the rest (merges, source reviews) stay in the admin log. */
const PUBLIC_ACTIONS = [
  'project.added',
  'round.added',
  'organization.added',
  'person.added',
  'person.linked',
  'program.linked',
  'record.verified',
  'record.updated',
  'link.added',
];

export async function loadUpdates(
  db: Executor,
  options: { since?: number; limit?: number; watch?: readonly WatchKey[] } = {},
): Promise<UpdateItem[]> {
  const limit = Math.min(options.limit ?? 50, 200);
  const since = new Date(options.since ?? Date.now() - 90 * 86_400_000).toISOString();

  // Resolve watched slugs to ids; a watched project also brings its rounds.
  let filter = sql`true`;
  let newsFilter = sql`true`;
  if (options.watch) {
    const bySlug = async (table: string, type: SubjectType, slugs: string[]) =>
      slugs.length
        ? (
            await rows<{ id: number }>(
              db,
              sql`select id from ${sql.identifier(table)} where slug in ${inList(slugs)}`,
            )
          ).map((r) => ({ type, id: r.id }))
        : [];
    const of = (t: WatchKey['type']) =>
      options.watch!.filter((w) => w.type === t).map((w) => w.slug);
    const subjects = [
      ...(await bySlug('projects', 'project', of('project'))),
      ...(await bySlug('people', 'person', of('person'))),
      ...(await bySlug('organizations', 'organization', of('organization'))),
    ];
    if (subjects.length === 0) return [];
    const projectIds = subjects.filter((s) => s.type === 'project').map((s) => s.id);
    const roundIds = projectIds.length
      ? (
          await rows<{ id: number }>(
            db,
            sql`select id from funding_rounds where project_id in ${inList(projectIds)}`,
          )
        ).map((r) => r.id)
      : [];
    const clauses = [
      ...subjects.map((s) => sql`(c.subject_type = ${s.type} and c.subject_id = ${s.id})`),
      ...(roundIds.length
        ? [sql`(c.subject_type = 'round' and c.subject_id in ${inList(roundIds)})`]
        : []),
    ];
    filter = sql.join(clauses, sql` or `);
    newsFilter = sql.join(
      subjects.map((s) => sql`(m.subject_type = ${s.type} and m.subject_id = ${s.id})`),
      sql` or `,
    );
  }

  const [changeRows, newsRows] = await Promise.all([
    rows<{
      id: number;
      at: number;
      action: string;
      summary: string;
      actor: string;
      subject_type: SubjectType | null;
      slug: string | null;
      name: string | null;
    }>(
      db,
      sql`select c.id, ${epoch('c.at')} as at, c.action, c.summary, c.actor, c.subject_type,
            coalesce(p.slug, pe.slug, o.slug, fr.slug) as slug,
            coalesce(p.name, pe.name, o.name, rp.name) as name
          from changes c
          left join projects p on c.subject_type = 'project' and p.id = c.subject_id
          left join people pe on c.subject_type = 'person' and pe.id = c.subject_id
          left join organizations o on c.subject_type = 'organization' and o.id = c.subject_id
          left join funding_rounds fr on c.subject_type = 'round' and fr.id = c.subject_id
          left join projects rp on rp.id = fr.project_id
          where c.at >= ${since}::timestamptz and c.action in ${inList(PUBLIC_ACTIONS)} and (${filter})
          order by c.at desc limit ${limit}`,
    ),
    rows<{
      id: number;
      at: number;
      title: string;
      url: string;
      publisher: string;
      subject_type: SubjectType;
      slug: string | null;
      name: string | null;
    }>(
      db,
      sql`select distinct on (n.id) n.id, ${epoch('n.published_at')} as at, n.title, n.url, n.publisher,
            m.subject_type, coalesce(p.slug, pe.slug, o.slug) as slug, coalesce(p.name, pe.name, o.name) as name
          from news n
          join news_mentions m on m.news_id = n.id and m.review_status <> 'rejected'
          left join projects p on m.subject_type = 'project' and p.id = m.subject_id
          left join people pe on m.subject_type = 'person' and pe.id = m.subject_id
          left join organizations o on m.subject_type = 'organization' and o.id = m.subject_id
          where not n.hidden and n.published_at >= ${since}::timestamptz and (${newsFilter})
          order by n.id, (m.subject_type = 'project') desc
          limit ${limit * 2}`,
    ),
  ]);

  const subjectHref = (type: SubjectType | null, slug: string | null) => {
    if (!type || !slug) return null;
    if (type === 'project') return `/projects/${slug}`;
    if (type === 'person') return `/people/${slug}`;
    if (type === 'organization') return `/investors/${slug}`;
    if (type === 'round') return `/rounds/${slug}`;
    return null;
  };

  const items: UpdateItem[] = [
    ...changeRows.map((c) => ({
      id: `c${c.id}`,
      at: c.at,
      kind: 'change' as const,
      action: c.action,
      title: c.summary,
      url: subjectHref(c.subject_type, c.slug) ?? '/updates',
      external: false,
      subject:
        c.subject_type && c.slug
          ? { type: c.subject_type, slug: c.slug, name: c.name ?? c.slug }
          : null,
      actor: c.actor,
      publisher: null,
    })),
    ...newsRows.map((n) => ({
      id: `n${n.id}`,
      at: n.at,
      kind: 'news' as const,
      action: 'news',
      title: n.title,
      url: n.url,
      external: true,
      subject: n.slug ? { type: n.subject_type, slug: n.slug, name: n.name ?? n.slug } : null,
      actor: null,
      publisher: n.publisher,
    })),
  ];
  return items.sort((a, b) => b.at - a.at).slice(0, limit);
}
