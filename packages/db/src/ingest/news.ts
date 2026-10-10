/**
 * News, from publishers' feeds, linked to the records it names.
 *
 * Items are kept for what a feed offers — headline, short summary, link,
 * date, image — and never the article itself (see the news adapter). Items
 * older than 120 days are not imported, and news older than a year is
 * deleted: this is a feed of what is happening, not an archive.
 *
 * Mentions are found by name and stored unreviewed, labelled with where the
 * name was found. Distinctive names go through core `findMentions`. A name
 * that is one ordinary-looking word — 158 of 345 projects: Arrow, Hedge,
 * Unit, Follows, DEEP — only counts written exactly as the record writes it,
 * in a story about Solana; "the market follows" is not news about Follows.
 * People are matched only on names of two or more words.
 */

import { SolanaNews, mentionsSolana, type FeedItem, type NewsFeed } from '@marketroom/adapters';
import { canonicalUrl, findMentions, type Mention, type MentionCandidate } from '@marketroom/core';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { rows, type Executor } from '../client';
import { evidence, news, newsMentions, type SubjectType } from '../schema';
import { chunk, upsertEvidence, upsertSources, type EvidenceInput } from '../write';
import type { JobContext, JobResult } from './context';

const DAY_MS = 86_400_000;
const IMPORT_DAYS = 120;
const KEEP_DAYS = 365;

type Mentionable = Extract<SubjectType, 'project' | 'organization' | 'person'>;

/** A record a text could mention: its name as the record writes it, and its aliases. */
export interface NamedCandidate {
  readonly id: number;
  readonly name: string;
  /** Normalised (lower case), as `aliases` stores them. */
  readonly aliases: readonly string[];
}

/**
 * Names that a text could mention. Rejected and merged records are left out:
 * a mention of a tombstone helps nobody. People need two or more words.
 */
export async function mentionCandidates(
  db: Executor,
  type: Mentionable,
  options: { investorsOnly?: boolean } = {},
): Promise<NamedCandidate[]> {
  const table =
    type === 'project' ? 'projects' : type === 'organization' ? 'organizations' : 'people';
  const found = await rows<{ id: number; name: string; aliases: string[] | null }>(
    db,
    sql`select t.id, t.name, array_agg(a.alias) filter (where a.alias is not null) as aliases
        from ${sql.identifier(table)} t
        left join aliases a on a.subject_type = ${type} and a.subject_id = t.id
        where t.merged_into_id is null and t.review_status <> 'rejected'
          ${options.investorsOnly && type === 'organization' ? sql`and t.is_investor` : sql``}
        group by t.id, t.name`,
  );
  const multiWord = (name: string) => /\S\s+\S/.test(name.trim());
  return found
    .filter((r) => type !== 'person' || multiWord(r.name))
    .map((r) => ({
      id: r.id,
      name: r.name.trim(),
      aliases: (r.aliases ?? []).filter((a) => type !== 'person' || multiWord(a)),
    }));
}

/** One word, letters only, capitalised or not: "Kamino", "orca", "DEEP" — but not "GooseFX" or "Pump.fun". */
const PLAIN_WORD = /^(?:[A-Z]?[a-z]+|[A-Z]+)$/;
const NEVER_A_NAME = new Set(['solana', 'sol']);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A mention finder for a set of records, compiled once and applied to many
 * texts. Returns a function of an item and whether the item is about Solana —
 * which a Solana-focused feed always is, and a general one only when it says so.
 */
export function mentionMatcher(candidates: readonly NamedCandidate[]) {
  const loose: MentionCandidate[] = [];
  const strict: { id: number; re: RegExp }[] = [];
  for (const c of candidates) {
    const names = new Set<string>();
    if (PLAIN_WORD.test(c.name)) {
      // All-lower-case plain words carry no sign of being a name; only long,
      // made-up ones ("marginfi", "basedbid") are worth matching at all.
      const usable = c.name.length >= 3 && !NEVER_A_NAME.has(c.name.toLowerCase());
      if (usable && (/[A-Z]/.test(c.name) || c.name.length >= 6)) {
        strict.push({
          id: c.id,
          re: new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRe(c.name)}(?=$|[^\\p{L}\\p{N}])`, 'u'),
        });
      }
    } else {
      names.add(c.name);
    }
    // Aliases are stored lower case, so a one-word alias says nothing the
    // record's own name does not; longer ones ("kamino finance") still count.
    for (const alias of c.aliases) if (!PLAIN_WORD.test(alias.trim())) names.add(alias);
    if (names.size) loose.push({ id: c.id, names: [...names] });
  }

  return (item: { title: string; summary?: string | null }, aboutSolana: boolean): Mention[] => {
    const found = new Map<number, Mention['matchedBy']>();
    for (const m of findMentions(item, loose)) found.set(m.id, m.matchedBy);
    if (aboutSolana) {
      for (const { id, re } of strict) {
        if (found.get(id) === 'title') continue;
        if (re.test(item.title)) found.set(id, 'title');
        else if (!found.has(id) && item.summary && re.test(item.summary)) found.set(id, 'summary');
      }
    }
    return [...found].map(([id, matchedBy]) => ({ id, matchedBy }));
  };
}

export async function syncNews(ctx: JobContext): Promise<JobResult> {
  const { db } = ctx;
  const results = await new SolanaNews({ signal: ctx.signal }).fetchAll();
  const failed = results.filter((r) => r.error !== null);
  for (const f of failed) ctx.log(`${f.feed.publisher}: ${f.error}`);
  if (failed.length === results.length) {
    throw new Error(
      `Every news feed failed: ${failed.map((f) => `${f.feed.publisher} (${f.error})`).join('; ')}`,
    );
  }

  const [projects, investors, people] = (
    await Promise.all([
      mentionCandidates(db, 'project'),
      mentionCandidates(db, 'organization', { investorsOnly: true }),
      mentionCandidates(db, 'person'),
    ])
  ).map(mentionMatcher);
  const matchers: [Mentionable, ReturnType<typeof mentionMatcher>][] = [
    ['project', projects!],
    ['organization', investors!],
    ['person', people!],
  ];
  const aboutSolana = (item: FeedItem, feed: NewsFeed) =>
    feed.scope === 'solana' || mentionsSolana(`${item.title} ${item.summary ?? ''}`);

  // What to keep: recent items; from general crypto feeds, only those about
  // Solana or naming a project we track.
  const now = ctx.now.getTime();
  const kept = new Map<string, { item: FeedItem; feed: NewsFeed }>();
  let fetched = 0;
  let offTopic = 0;
  for (const r of results) {
    for (const item of r.items) {
      fetched += 1;
      // Too old to be news; or dated in the future by a feed with a wrong clock.
      if (item.publishedAt < now - IMPORT_DAYS * DAY_MS || item.publishedAt > now + DAY_MS)
        continue;
      // Off-topic unless it says Solana, or names a project distinctively
      // enough to count without that context.
      if (
        r.feed.scope === 'general' &&
        !aboutSolana(item, r.feed) &&
        projects!(item, false).length === 0
      ) {
        offTopic += 1;
        continue;
      }
      if (!kept.has(item.url)) kept.set(item.url, { item, feed: r.feed });
    }
  }

  const items = [...kept.values()];
  const urls = items.map((k) => k.item.url);
  const existing = new Set<string>();
  for (const batch of chunk(urls, 500)) {
    for (const r of await db.select({ url: news.url }).from(news).where(inArray(news.url, batch))) {
      existing.add(r.url);
    }
  }

  const idByUrl = new Map<string, number>();
  for (const batch of chunk(items, 200)) {
    const saved = await db
      .insert(news)
      .values(
        batch.map(({ item, feed }) => ({
          url: item.url,
          title: item.title,
          publisher: feed.publisher,
          publishedAt: new Date(item.publishedAt),
          summary: item.summary,
          imageUrl: item.imageUrl,
          feedUrl: feed.url,
          fetchedAt: ctx.now,
        })),
      )
      .onConflictDoUpdate({
        target: news.url,
        // Headlines get corrected; the date, publisher and an editor's `hidden` stay.
        set: {
          title: sql`excluded.title`,
          summary: sql`coalesce(excluded.summary, ${news.summary})`,
          imageUrl: sql`coalesce(excluded.image_url, ${news.imageUrl})`,
        },
      })
      .returning({ id: news.id, url: news.url });
    for (const s of saved) idByUrl.set(s.url, s.id);
  }

  // Each item is its own source: the article, as published.
  const sourceIds = await upsertSources(
    db,
    items.map(({ item, feed }) => ({
      url: item.url,
      title: item.title,
      publisher: feed.publisher,
      kind: feed.kind,
      publishedAt: new Date(item.publishedAt),
    })),
  );
  const ev: EvidenceInput[] = [];
  for (const { item } of items) {
    const id = idByUrl.get(item.url);
    const sourceId = sourceIds.get(canonicalUrl(item.url));
    if (id && sourceId) {
      ev.push({
        subjectType: 'news',
        subjectId: id,
        sourceId,
        method: 'imported',
        checkedBy: ctx.actor,
      });
    }
  }
  await upsertEvidence(db, ev);

  // Mentions — re-found for every recent item, so a project added since an
  // item was first imported is linked to it too. An editor's rejection stays.
  const mentions: (typeof newsMentions.$inferInsert)[] = [];
  for (const { item, feed } of items) {
    const newsId = idByUrl.get(item.url);
    if (!newsId) continue;
    const solana = aboutSolana(item, feed);
    for (const [subjectType, match] of matchers) {
      for (const m of match(item, solana)) {
        mentions.push({
          newsId,
          subjectType,
          subjectId: m.id,
          matchedBy: m.matchedBy,
          reviewStatus: 'unreviewed',
        });
      }
    }
  }
  let newMentions = 0;
  for (const batch of chunk(mentions, 300)) {
    const inserted = await db
      .insert(newsMentions)
      .values(batch)
      .onConflictDoNothing()
      .returning({ id: newsMentions.id });
    newMentions += inserted.length;
  }

  // A year on, news is history; its evidence goes with it (mentions cascade).
  const cutoff = new Date(now - KEEP_DAYS * DAY_MS).toISOString();
  const gone = await rows<{ id: number }>(
    db,
    sql`delete from ${news} where published_at < ${cutoff}::timestamptz returning id`,
  );
  for (const batch of chunk(
    gone.map((g) => g.id),
    500,
  )) {
    await db
      .delete(evidence)
      .where(and(eq(evidence.subjectType, 'news'), inArray(evidence.subjectId, batch)));
  }

  return {
    stats: {
      feeds: results.length,
      feedsFailed: failed.length,
      fetched,
      offTopic,
      kept: items.length,
      created: items.filter((k) => !existing.has(k.item.url)).length,
      mentions: mentions.length,
      mentionsCreated: newMentions,
      deleted: gone.length,
    },
    partial: failed.length > 0,
  };
}
