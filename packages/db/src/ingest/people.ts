/**
 * People, from the code they commit: each project's GitHub contributors.
 *
 * A project's GitHub organisations come from DefiLlama (see `projects`).
 * For each, the repositories read are the ones its verified builds were made
 * from — the deployed programs' own source — or, failing that, its most
 * starred original repository. Their top contributors by commits become
 * people, linked to the project as code contributors.
 *
 * Every person and link made here is a suggestion: a contributor might be an
 * outside developer, and an organisation's login might have changed hands
 * (see the GitHub adapter). People start unreviewed, links carry the commit
 * count they rest on, and nothing an editor wrote is overwritten — an
 * organisation's profile can only *corroborate* a project's website or X
 * account, never replace it.
 *
 * GitHub allows 60 requests an hour without a token. Each run spends at most
 * 40 (400 with `GITHUB_TOKEN`), stops early when GitHub says fewer than five
 * are left, and works through projects stalest first, so coverage builds up
 * run by run.
 */

import {
  GitHub,
  GithubBudgetExhausted,
  parseRepoUrl,
  pickContributors,
  pickRepos,
  sameHandle,
  sameSite,
  websiteFromBlog,
  type GithubOwner,
} from '@marketroom/adapters';
import { canonicalUrl, uniqueSlug } from '@marketroom/core';
import { and, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { rows } from '../client';
import { people, programs, projectPeople, projectPrograms, syncState } from '../schema';
import {
  addAliases,
  recordChanges,
  takenSlugs,
  upsertEvidence,
  upsertSources,
  type ChangeInput,
  type EvidenceInput,
} from '../write';
import { firstSentence, type JobContext, type JobResult } from './context';

const JOB = 'people';
const ROLE = 'Code contributor';
/** Organisations read per project: most list one; a few list several, mostly forks and SDKs. */
const ORGS_PER_PROJECT = 2;

interface Target {
  id: number;
  slug: string;
  name: string;
  github_orgs: string[];
  website: string | null;
  twitter: string | null;
}

async function dueProjects(ctx: JobContext, limit: number): Promise<Target[]> {
  return rows<Target>(
    ctx.db,
    sql`
      select p.id, p.slug, p.name, p.github_orgs, p.website, p.twitter
      from projects p
      left join ${syncState} s
        on s.job = ${JOB} and s.subject_type = 'project' and s.subject_id = p.id
      left join lateral (
        select tvl_solana from project_metrics m
        where m.project_id = p.id order by m.captured_at desc limit 1
      ) m on true
      where cardinality(p.github_orgs) > 0 and p.merged_into_id is null and p.review_status <> 'rejected'
      order by s.synced_at asc nulls first, m.tvl_solana desc nulls last, p.id
      limit ${limit}`,
  );
}

const githubProfile = (login: string) => `https://github.com/${login}`;
const contributorsPage = (owner: string, repo: string) =>
  `https://github.com/${owner}/${repo}/graphs/contributors`;

export async function syncPeople(ctx: JobContext): Promise<JobResult> {
  const token = ctx.env.githubToken || null;
  const gh = new GitHub({ token, signal: ctx.signal, maxCalls: token ? 400 : 40, reserve: 5 });

  // Free to ask, and saves spending a request only to be refused.
  const limit = await gh.rateLimit().catch(() => null);
  if (limit && limit.remaining < 5) {
    ctx.log(
      `GitHub has ${limit.remaining} requests left until ${new Date(limit.resetAt).toISOString()}`,
    );
    return { stats: { projects: 0, budgetExhausted: 1, remaining: limit.remaining } };
  }

  const batch = await dueProjects(ctx, token ? 80 : 10);
  const writer = new PeopleWriter(ctx, gh);
  await writer.load(batch.map((p) => p.id));

  let processed = 0;
  let failed = 0;
  let exhausted = false;
  for (const project of batch) {
    try {
      await writer.project(project);
      await markSynced(ctx, project.id, true);
      processed += 1;
    } catch (error) {
      if (error instanceof GithubBudgetExhausted) {
        // Not synced: the next run starts with this project, and the people
        // already created here are reused rather than fetched again.
        ctx.log(error.message);
        exhausted = true;
        break;
      }
      failed += 1;
      ctx.log(`${project.name}: ${error instanceof Error ? error.message : String(error)}`);
      await markSynced(ctx, project.id, false);
    }
  }
  await writer.flush();

  return {
    stats: {
      projects: processed,
      failed,
      ...writer.stats,
      calls: gh.used,
      ...(gh.remaining !== null ? { remaining: gh.remaining } : {}),
      budgetExhausted: exhausted ? 1 : 0,
    },
    partial: failed > 0,
  };
}

class PeopleWriter {
  readonly stats = { people: 0, links: 0, corroborated: 0, missingOrgs: 0, repoFailures: 0 };
  private byLogin = new Map<string, number | null>();
  private verifiedRepos = new Map<number, { owner: string; name: string }[]>();
  private taken = new Set<string>();
  private ev: EvidenceInput[] = [];
  private changes: ChangeInput[] = [];

  constructor(
    private readonly ctx: JobContext,
    private readonly gh: GitHub,
  ) {}

  async load(projectIds: readonly number[]) {
    const { db } = this.ctx;
    const known = await db
      .select({ id: people.id, github: people.github })
      .from(people)
      .where(and(isNotNull(people.github), sql`${people.mergedIntoId} is null`));
    for (const p of known) this.byLogin.set(p.github!.trim().toLowerCase(), p.id);
    this.taken = await takenSlugs(db, 'people');
    if (projectIds.length === 0) return;
    const repos = await db
      .select({ projectId: projectPrograms.projectId, repo: programs.verifiedRepo })
      .from(projectPrograms)
      .innerJoin(programs, eq(programs.id, projectPrograms.programId))
      .where(
        and(
          inArray(projectPrograms.projectId, [...projectIds]),
          ne(projectPrograms.reviewStatus, 'rejected'),
          eq(programs.verifiedBuild, true),
          isNotNull(programs.verifiedRepo),
        ),
      );
    for (const r of repos) {
      const ref = parseRepoUrl(r.repo);
      if (ref?.host !== 'github.com') continue;
      const list = this.verifiedRepos.get(r.projectId) ?? [];
      list.push({ owner: ref.owner, name: ref.name });
      this.verifiedRepos.set(r.projectId, list);
    }
  }

  async project(project: Target) {
    for (const org of [...new Set(project.github_orgs.map((o) => o.trim()).filter(Boolean))].slice(
      0,
      ORGS_PER_PROJECT,
    )) {
      const owner = await this.gh.owner(org);
      if (!owner) {
        // Renamed or deleted: what DefiLlama lists no longer exists.
        this.stats.missingOrgs += 1;
        continue;
      }
      await this.corroborate(project, owner);
      const listing = await this.gh.repos(owner);
      const verified = (this.verifiedRepos.get(project.id) ?? [])
        .filter((r) => r.owner.toLowerCase() === org.toLowerCase())
        .map((r) => r.name);
      for (const repo of pickRepos(listing, verified)) {
        let contributors;
        try {
          contributors = await this.gh.contributors(owner.login, repo);
        } catch (error) {
          if (error instanceof GithubBudgetExhausted) throw error;
          // GitHub declines to list contributors for very large histories; the project goes on.
          this.stats.repoFailures += 1;
          continue;
        }
        for (const c of pickContributors(contributors)) {
          const personId = await this.person(c.login);
          if (personId !== null)
            await this.link(project, personId, owner.login, repo, c.contributions);
        }
      }
    }
  }

  /** What the organisation's profile says, as extra evidence for what the project already says. */
  private async corroborate(project: Target, owner: GithubOwner) {
    const matches: { field: 'website' | 'twitter'; note: string }[] = [];
    if (project.website && owner.blog && sameSite(project.website, owner.blog)) {
      matches.push({
        field: 'website',
        note: `The GitHub organisation ${owner.login} lists the same website.`,
      });
    }
    if (project.twitter && owner.twitter && sameHandle(project.twitter, owner.twitter)) {
      matches.push({
        field: 'twitter',
        note: `The GitHub organisation ${owner.login} lists the same X account.`,
      });
    }
    if (matches.length === 0) return;
    const sourceId = await this.source(githubProfile(owner.login), `${owner.login} on GitHub`);
    if (!sourceId) return;
    for (const m of matches) {
      this.ev.push({
        subjectType: 'project',
        subjectId: project.id,
        field: m.field,
        sourceId,
        method: 'imported',
        checkedBy: this.ctx.actor,
        note: m.note,
      });
      this.stats.corroborated += 1;
    }
  }

  /** The person with this GitHub login — created from their profile if nobody has it yet. */
  private async person(login: string): Promise<number | null> {
    const key = login.toLowerCase();
    if (this.byLogin.has(key)) return this.byLogin.get(key) ?? null;
    const user = await this.gh.user(login);
    if (!user || user.type !== 'User') {
      this.byLogin.set(key, null);
      return null;
    }
    const name = user.name ?? user.login;
    const slug = uniqueSlug(name, (s) => this.taken.has(s));
    this.taken.add(slug);
    const website = websiteFromBlog(user.blog);
    const twitter = user.twitter?.replace(/^@/, '') || null;
    const [row] = await this.ctx.db
      .insert(people)
      .values({
        slug,
        name,
        avatarUrl: user.avatarUrl,
        headline: firstSentence(user.bio),
        location: user.location,
        twitter,
        website,
        github: user.login,
        reviewStatus: 'unreviewed',
      })
      .returning({ id: people.id });
    const id = row!.id;
    this.byLogin.set(key, id);
    this.stats.people += 1;
    await addAliases(this.ctx.db, 'person', [{ subjectId: id, name }]);

    const sourceId = await this.source(githubProfile(user.login), `${user.login} on GitHub`);
    if (sourceId) {
      const base = {
        subjectType: 'person' as const,
        subjectId: id,
        sourceId,
        method: 'imported' as const,
        checkedBy: this.ctx.actor,
      };
      this.ev.push(base, { ...base, field: 'name' }, { ...base, field: 'github' });
      if (user.avatarUrl) this.ev.push({ ...base, field: 'avatarUrl' });
      if (user.bio) this.ev.push({ ...base, field: 'headline' });
      if (user.location) this.ev.push({ ...base, field: 'location' });
      if (twitter) this.ev.push({ ...base, field: 'twitter' });
      if (website) this.ev.push({ ...base, field: 'website' });
    }
    return id;
  }

  private async link(
    project: Target,
    personId: number,
    owner: string,
    repo: string,
    commits: number,
  ) {
    const { db } = this.ctx;
    const [inserted] = await db
      .insert(projectPeople)
      .values({ projectId: project.id, personId, role: ROLE })
      .onConflictDoNothing()
      .returning({ id: projectPeople.id });
    // An existing link keeps its state — a rejected one stays rejected and gets nothing new.
    const link =
      inserted ??
      (
        await db
          .select({ id: projectPeople.id, reviewStatus: projectPeople.reviewStatus })
          .from(projectPeople)
          .where(
            and(
              eq(projectPeople.projectId, project.id),
              eq(projectPeople.personId, personId),
              eq(projectPeople.role, ROLE),
            ),
          )
          .limit(1)
      ).find((l) => l.reviewStatus !== 'rejected');
    if (!link) return;

    const note = `${commits} commits to ${owner}/${repo}`;
    const sourceId = await this.source(
      contributorsPage(owner, repo),
      `Contributors to ${owner}/${repo}`,
    );
    if (sourceId) {
      this.ev.push({
        subjectType: 'project_person',
        subjectId: link.id,
        sourceId,
        method: 'inferred',
        checkedBy: this.ctx.actor,
        note,
      });
    }
    if (inserted) {
      this.stats.links += 1;
      if (!this.ctx.bootstrap) {
        const [person] = await db
          .select({ name: people.name })
          .from(people)
          .where(eq(people.id, personId));
        this.changes.push({
          actor: this.ctx.actor,
          action: 'person.linked',
          subjectType: 'project',
          subjectId: project.id,
          summary: `${person?.name ?? 'A contributor'} — code contributor to ${project.name} (${note})`,
        });
      }
    }
  }

  private sources = new Map<string, number>();

  private async source(url: string, title: string): Promise<number | null> {
    const key = canonicalUrl(url);
    const cached = this.sources.get(key);
    if (cached !== undefined) return cached;
    const ids = await upsertSources(this.ctx.db, [
      { url, title, publisher: 'GitHub', kind: 'repository' },
    ]);
    const id = ids.get(key) ?? null;
    if (id !== null) this.sources.set(key, id);
    return id;
  }

  async flush() {
    await upsertEvidence(this.ctx.db, this.ev);
    await recordChanges(this.ctx.db, this.changes);
    this.ev = [];
    this.changes = [];
  }
}

async function markSynced(ctx: JobContext, projectId: number, ok: boolean) {
  await ctx.db
    .insert(syncState)
    .values({ job: JOB, subjectType: 'project', subjectId: projectId, syncedAt: ctx.now, ok })
    .onConflictDoUpdate({
      target: [syncState.job, syncState.subjectType, syncState.subjectId],
      set: { syncedAt: ctx.now, ok },
    });
}
