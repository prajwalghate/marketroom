/**
 * Solana programs, from OtterSec's verification registry and Jupiter's swap
 * venue labels — and, for each, a guess at which project operates it.
 *
 * That a program's deployed bytecode was rebuilt from a public repository at
 * a given commit is OtterSec's finding about the program, imported as such.
 * That Jupiter routes swaps through a program, under a name, is Jupiter's.
 * Neither says which *project* a program belongs to. That is inferred — from
 * the repository's GitHub owner being an organisation DefiLlama lists for a
 * project, or from Jupiter's label starting with a project's name — and every
 * such mapping is created for review, with a note saying how it was made.
 */

import {
  buildLabelIndex,
  JUPITER_LABELS,
  matchLabel,
  otterSecStatusPage,
  prettyRepoName,
  ProgramRegistry,
  type SwapLabel,
  type VerifiedProgram,
} from '@marketroom/adapters';
import { canonicalUrl } from '@marketroom/core';
import { and, eq, isNotNull, ne, notInArray, sql } from 'drizzle-orm';
import { rows } from '../client';
import { programs, projectPrograms } from '../schema';
import {
  chunk,
  recordChanges,
  unlockedSet,
  upsertEvidence,
  upsertSources,
  type ChangeInput,
  type EvidenceInput,
} from '../write';
import type { JobContext, JobResult } from './context';
import { defillamaPage } from './projects';

/** What a program's kind is when the only thing known is that Jupiter routes swaps through it. */
const SWAP_VENUE = 'Swap venue';

interface ProjectRow {
  id: number;
  slug: string;
  name: string;
  key: string | null;
  github_orgs: string[];
  aliases: string[];
}

interface Candidate {
  readonly programId: number;
  readonly address: string;
  readonly programName: string | null;
  readonly project: ProjectRow;
  readonly sourceUrl: string;
  /** DefiLlama's page for the project, when the inference also rests on what DefiLlama lists. */
  readonly projectSourceUrl: string | null;
  readonly note: string;
}

const shortAddress = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

export async function syncPrograms(ctx: JobContext): Promise<JobResult> {
  const { db } = ctx;
  const registry = new ProgramRegistry({ signal: ctx.signal });
  const [verifiedResult, labelResult] = await Promise.allSettled([
    registry.verified(),
    registry.swapLabels(),
  ]);
  if (verifiedResult.status === 'rejected' && labelResult.status === 'rejected') {
    throw verifiedResult.reason;
  }
  const verified = verifiedResult.status === 'fulfilled' ? verifiedResult.value : null;
  const labels = labelResult.status === 'fulfilled' ? labelResult.value : null;
  if (!verified)
    ctx.log(
      `OtterSec unavailable: ${String(verifiedResult.status === 'rejected' && verifiedResult.reason)}`,
    );
  if (!labels)
    ctx.log(
      `Jupiter labels unavailable: ${String(labelResult.status === 'rejected' && labelResult.reason)}`,
    );
  ctx.log(
    `OtterSec lists ${verified?.length ?? '—'} verified programs; Jupiter labels ${labels?.length ?? '—'}`,
  );

  const before = await db
    .select({
      address: programs.address,
      verifiedBuild: programs.verifiedBuild,
      verifiedRepo: programs.verifiedRepo,
    })
    .from(programs);
  const known = new Set(before.map((p) => p.address));
  const wasVerified = before.filter((p) => p.verifiedBuild && p.verifiedRepo).length;

  const saved = new Map<string, { id: number; name: string | null }>();
  if (verified) for (const s of await upsertVerified(ctx, verified)) saved.set(s.address, s);
  if (labels) for (const s of await upsertLabelled(ctx, labels)) saved.set(s.address, s);
  const created = [...saved.keys()].filter((a) => !known.has(a)).length;

  // A program OtterSec no longer lists has lost its verified status — usually
  // an upgrade nobody re-verified. Only trusted when the list looks whole: a
  // truncated response must not strip every program of its badge.
  let unverified: { id: number; address: string }[] = [];
  if (verified && verified.length >= Math.max(50, wasVerified / 2)) {
    unverified = await db
      .update(programs)
      .set({ verifiedBuild: false, updatedAt: new Date() })
      .where(
        and(
          eq(programs.verifiedBuild, true),
          isNotNull(programs.verifiedRepo),
          ne(programs.reviewStatus, 'rejected'),
          sql`not ('verifiedBuild' = any(${programs.lockedFields}))`,
          notInArray(
            programs.address,
            verified.map((v) => v.address),
          ),
        ),
      )
      .returning({ id: programs.id, address: programs.address });
  }

  await evidenceForPrograms(ctx, verified ?? [], labels ?? [], saved, unverified);
  const mapping = await mapToProjects(ctx, verified ?? [], labels ?? [], saved);

  return {
    stats: {
      verified: verified?.length ?? 0,
      labelled: labels?.length ?? 0,
      programs: saved.size,
      created,
      unverified: unverified.length,
      ...mapping,
    },
    partial: !verified || !labels,
  };
}

/** OtterSec's findings, by address. A repository's name only fills a blank name. */
async function upsertVerified(ctx: JobContext, list: readonly VerifiedProgram[]) {
  const out: { address: string; id: number; name: string | null }[] = [];
  for (const batch of chunk(list, 200)) {
    out.push(
      ...(await ctx.db
        .insert(programs)
        .values(
          batch.map((p) => ({
            address: p.address,
            name: p.repo ? prettyRepoName(p.repo.name) : null,
            verifiedBuild: true,
            verifiedRepo: p.repoUrl,
            verifiedCommit: p.commit,
            verifiedAt: p.verifiedAt === null ? null : new Date(p.verifiedAt),
          })),
        )
        .onConflictDoUpdate({
          target: programs.address,
          set: {
            ...unlockedSet(programs, programs as never, [
              'verifiedBuild',
              'verifiedRepo',
              'verifiedCommit',
              'verifiedAt',
            ]),
            name: sql`case when 'name' = any(${programs.lockedFields}) then ${programs.name} else coalesce(${programs.name}, excluded.name) end`,
            updatedAt: sql`now()`,
          },
          // A program an editor rejected stays rejected, and is not refreshed.
          setWhere: sql`${programs.reviewStatus} <> 'rejected'`,
        })
        .returning({ address: programs.address, id: programs.id, name: programs.name })),
    );
  }
  return out;
}

/** Jupiter's names win over a repository's, but never over an editor's. */
async function upsertLabelled(ctx: JobContext, list: readonly SwapLabel[]) {
  const out: { address: string; id: number; name: string | null }[] = [];
  for (const batch of chunk(list, 200)) {
    out.push(
      ...(await ctx.db
        .insert(programs)
        .values(batch.map((l) => ({ address: l.address, name: l.label, kind: SWAP_VENUE })))
        .onConflictDoUpdate({
          target: programs.address,
          set: {
            name: sql`case when 'name' = any(${programs.lockedFields}) then ${programs.name} else excluded.name end`,
            kind: sql`case when 'kind' = any(${programs.lockedFields}) then ${programs.kind} else coalesce(${programs.kind}, excluded.kind) end`,
            updatedAt: sql`now()`,
          },
          setWhere: sql`${programs.reviewStatus} <> 'rejected'`,
        })
        .returning({ address: programs.address, id: programs.id, name: programs.name })),
    );
  }
  return out;
}

async function evidenceForPrograms(
  ctx: JobContext,
  verified: readonly VerifiedProgram[],
  labels: readonly SwapLabel[],
  saved: ReadonlyMap<string, { id: number; name: string | null }>,
  unverified: readonly { id: number; address: string }[],
) {
  const sourceIds = await upsertSources(ctx.db, [
    ...[...verified.map((v) => v.address), ...unverified.map((u) => u.address)].map((address) => ({
      url: otterSecStatusPage(address),
      title: `${saved.get(address)?.name ?? address} on OtterSec`,
      publisher: 'OtterSec',
      kind: 'registry' as const,
    })),
    ...(labels.length
      ? [
          {
            url: JUPITER_LABELS,
            title: 'Jupiter swap venue labels',
            publisher: 'Jupiter',
            kind: 'api' as const,
          },
        ]
      : []),
  ]);
  const ev: EvidenceInput[] = [];
  const labelByAddress = new Map(labels.map((l) => [l.address, l.label]));

  for (const v of verified) {
    const program = saved.get(v.address);
    const sourceId = sourceIds.get(canonicalUrl(otterSecStatusPage(v.address)));
    if (!program || !sourceId) continue;
    const base = {
      subjectType: 'program' as const,
      subjectId: program.id,
      sourceId,
      checkedBy: ctx.actor,
    };
    ev.push(
      { ...base, method: 'imported' },
      { ...base, field: 'verifiedBuild', method: 'imported' },
    );
    if (v.repoUrl) ev.push({ ...base, field: 'verifiedRepo', method: 'imported' });
    if (v.commit) ev.push({ ...base, field: 'verifiedCommit', method: 'imported' });
    if (v.verifiedAt !== null) ev.push({ ...base, field: 'verifiedAt', method: 'imported' });
    // Named after the repository only when nothing better named it.
    if (v.repo && !labelByAddress.has(v.address) && program.name === prettyRepoName(v.repo.name)) {
      ev.push({
        ...base,
        field: 'name',
        method: 'inferred',
        note: `Named after its verified-build repository, ${v.repo.owner}/${v.repo.name}.`,
      });
    }
  }

  for (const u of unverified) {
    const sourceId = sourceIds.get(canonicalUrl(otterSecStatusPage(u.address)));
    if (!sourceId) continue;
    ev.push({
      subjectType: 'program',
      subjectId: u.id,
      field: 'verifiedBuild',
      sourceId,
      method: 'imported',
      checkedBy: ctx.actor,
      note: 'No longer listed by OtterSec as a verified build — usually an upgrade not yet re-verified.',
    });
  }

  const jupiterSource = sourceIds.get(canonicalUrl(JUPITER_LABELS));
  if (jupiterSource) {
    for (const l of labels) {
      const program = saved.get(l.address);
      if (!program) continue;
      const base = {
        subjectType: 'program' as const,
        subjectId: program.id,
        sourceId: jupiterSource,
        checkedBy: ctx.actor,
      };
      ev.push({ ...base, method: 'imported' });
      // Jupiter backs the name only if the name is Jupiter's — not an editor's.
      if (program.name === l.label) ev.push({ ...base, field: 'name', method: 'imported' });
      ev.push({
        ...base,
        field: 'kind',
        method: 'inferred',
        note: 'Jupiter routes swaps through this program.',
      });
    }
  }
  await upsertEvidence(ctx.db, ev);
}

/**
 * Program → project guesses, for review.
 *
 * By repository: the verified build's source lives under a GitHub account
 * that DefiLlama lists as one of a project's organisations. Logins are
 * matched case-insensitively — GitHub treats them so — and the note warns
 * that a login can change hands.
 *
 * By label: Jupiter's name for the program starts with a project's name.
 */
async function mapToProjects(
  ctx: JobContext,
  verified: readonly VerifiedProgram[],
  labels: readonly SwapLabel[],
  saved: ReadonlyMap<string, { id: number; name: string | null }>,
): Promise<{ links: number; linksByRepository: number; linksByLabel: number }> {
  const { db } = ctx;
  const projectRows = await rows<ProjectRow>(
    db,
    sql`select p.id, p.slug, p.name, p.defillama_key as key, p.github_orgs,
          coalesce(array_agg(a.alias) filter (where a.alias is not null), '{}') as aliases
        from projects p
        left join aliases a on a.subject_type = 'project' and a.subject_id = p.id
        where p.merged_into_id is null and p.review_status <> 'rejected'
        group by p.id`,
  );

  const byOrg = new Map<string, ProjectRow[]>();
  for (const p of projectRows) {
    for (const org of p.github_orgs ?? []) {
      const key = org.trim().toLowerCase();
      if (key) byOrg.set(key, [...(byOrg.get(key) ?? []).filter((x) => x.id !== p.id), p]);
    }
  }
  const index = buildLabelIndex(
    projectRows.map((p) => ({ id: p.id, names: [p.name, ...(p.aliases ?? [])] })),
  );
  const projectById = new Map(projectRows.map((p) => [p.id, p]));

  const candidates: Candidate[] = [];
  let byRepository = 0;
  let byLabel = 0;
  for (const v of verified) {
    const program = saved.get(v.address);
    if (!program || v.repo?.host !== 'github.com') continue;
    for (const project of byOrg.get(v.repo.owner.toLowerCase()) ?? []) {
      candidates.push({
        programId: program.id,
        address: v.address,
        programName: program.name,
        project,
        sourceUrl: otterSecStatusPage(v.address),
        projectSourceUrl: project.key ? defillamaPage(project.key) : null,
        note:
          `Verified-build source github.com/${v.repo.owner}/${v.repo.name} is owned by ${v.repo.owner}, ` +
          `a GitHub organisation DefiLlama lists for ${project.name}. GitHub logins can be renamed or ` +
          `re-registered, so confirm the organisation is still theirs.`,
      });
    }
  }
  for (const l of labels) {
    const program = saved.get(l.address);
    const match = program ? matchLabel(l.label, index) : null;
    const project = match ? projectById.get(match.id) : undefined;
    if (!program || !match || !project) continue;
    candidates.push({
      programId: program.id,
      address: l.address,
      programName: program.name,
      project,
      sourceUrl: JUPITER_LABELS,
      projectSourceUrl: null,
      note: `Jupiter labels this program “${l.label}”, which begins with ${project.name} (matched “${match.matched}”).`,
    });
  }

  const existing = await db
    .select({
      id: projectPrograms.id,
      projectId: projectPrograms.projectId,
      programId: projectPrograms.programId,
      reviewStatus: projectPrograms.reviewStatus,
    })
    .from(projectPrograms);
  const linkKey = (projectId: number, programId: number) => `${projectId}:${programId}`;
  const links = new Map(existing.map((l) => [linkKey(l.projectId, l.programId), l]));

  // New links: first note wins; an existing link — even a rejected one — is left as it is.
  const fresh = new Map<string, Candidate>();
  for (const c of candidates) {
    const key = linkKey(c.project.id, c.programId);
    if (!links.has(key) && !fresh.has(key)) fresh.set(key, c);
  }
  const changes: ChangeInput[] = [];
  for (const batch of chunk([...fresh.values()], 200)) {
    const inserted = await db
      .insert(projectPrograms)
      .values(
        batch.map((c) => ({
          projectId: c.project.id,
          programId: c.programId,
          relation: 'operates' as const,
          note: c.note,
          reviewStatus: 'needs_review' as const,
        })),
      )
      .onConflictDoNothing()
      .returning({
        id: projectPrograms.id,
        projectId: projectPrograms.projectId,
        programId: projectPrograms.programId,
      });
    for (const link of inserted) {
      links.set(linkKey(link.projectId, link.programId), { ...link, reviewStatus: 'needs_review' });
      const c = fresh.get(linkKey(link.projectId, link.programId))!;
      if (c.sourceUrl === JUPITER_LABELS) byLabel += 1;
      else byRepository += 1;
      if (!ctx.bootstrap) {
        changes.push({
          actor: ctx.actor,
          action: 'program.linked',
          subjectType: 'project',
          subjectId: c.project.id,
          summary: `Program ${c.programName ? `${c.programName} (${shortAddress(c.address)})` : shortAddress(c.address)} mapped to ${c.project.name} — needs review`,
        });
      }
    }
  }

  // Evidence for every guess whose link stands, new or old; none for a link
  // an editor rejected. The registry and label sources already exist (stored
  // with the programs' own evidence); upserting them again only returns ids.
  const sourceIds = await upsertSources(db, [
    ...candidates.map((c) => ({ url: c.sourceUrl })),
    ...candidates.flatMap((c) =>
      c.projectSourceUrl
        ? [
            {
              url: c.projectSourceUrl,
              title: `${c.project.name} on DefiLlama`,
              publisher: 'DefiLlama',
              kind: 'database' as const,
            },
          ]
        : [],
    ),
  ]);
  const ev: EvidenceInput[] = [];
  for (const c of candidates) {
    const link = links.get(linkKey(c.project.id, c.programId));
    if (!link || link.reviewStatus === 'rejected') continue;
    for (const url of [c.sourceUrl, c.projectSourceUrl]) {
      const sourceId = url ? sourceIds.get(canonicalUrl(url)) : undefined;
      if (sourceId === undefined) continue;
      ev.push({
        subjectType: 'project_program',
        subjectId: link.id,
        sourceId,
        method: 'inferred',
        checkedBy: ctx.actor,
        note: c.note,
      });
    }
  }
  await upsertEvidence(db, ev);
  await recordChanges(db, changes);
  return { links: byRepository + byLabel, linksByRepository: byRepository, linksByLabel: byLabel };
}
