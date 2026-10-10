'use server';

import {
  addEvidence,
  addRoundInvestor,
  confirmEvidence,
  convertParty,
  createRecord,
  dismissDuplicate,
  EditError,
  EvidenceRuleError,
  linkPerson,
  linkProgram,
  linkToken,
  mergeRecords,
  parseFields,
  removeEvidence,
  reviewSource,
  runJob,
  setReview,
  setReviewMany,
  slugOf,
  unlockField,
  updateLink,
  updateRecord,
  type EditableType,
  type MergeType,
  type ReviewStatus,
  type ReviewTarget,
  type SourceKind,
  type SubjectType,
} from '@marketroom/db';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { requireEditor, signIn, signOut } from '@/lib/admin';
import { clearReadCache, getDb, jobEnv } from '@/lib/db';

/**
 * Editors' actions. Each one checks who is asking first — a server action is
 * a public POST endpoint, whatever page its form sits on — then writes through
 * the database layer (which logs the change), clears the read cache so the
 * correction shows on the next page view, and returns the editor to where
 * they were with the outcome.
 */

const EDITABLE: EditableType[] = [
  'project',
  'person',
  'organization',
  'round',
  'token',
  'program',
  'event',
];
const REVIEWABLE: ReviewTarget[] = [
  ...EDITABLE,
  'project_person',
  'organization_person',
  'round_investor',
  'project_program',
  'news_mention',
  'event_link',
];

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim() : '';
};
const num = (form: FormData, key: string) => {
  const n = Number(str(form, key));
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Only same-site paths: a form field must never send an editor off-site. */
function safeBack(form: FormData, fallback = '/admin'): string {
  const back = str(form, 'back');
  // A path on this site only: not `//host`, and no backslashes, which some
  // browsers read as slashes (`/\\host`).
  return /^\/(?![/\\])[^\s\\]*$/.test(back) ? back : fallback;
}

function withFlash(path: string, key: 'ok' | 'error', message: string): string {
  const [base, hash] = path.split('#');
  const url = new URL(base!, 'http://x');
  url.searchParams.delete('ok');
  url.searchParams.delete('error');
  url.searchParams.set(key, message.slice(0, 300));
  return `${url.pathname}${url.search}${hash ? `#${hash}` : ''}`;
}

/** Run an edit; expected failures come back to the form as a message. */
async function attempt(
  form: FormData,
  run: (editor: string) => Promise<string | void>,
  okMessage: string,
) {
  const editor = await requireEditor();
  let next: string | void;
  try {
    next = await run(editor);
  } catch (error) {
    if (error instanceof EditError || error instanceof EvidenceRuleError) {
      redirect(withFlash(safeBack(form), 'error', error.message));
    }
    throw error;
  }
  clearReadCache();
  redirect(withFlash(next || safeBack(form), 'ok', okMessage));
}

const sourceFrom = (form: FormData) => {
  const url = str(form, 'sourceUrl');
  return url
    ? {
        url,
        title: str(form, 'sourceTitle') || null,
        kind: (str(form, 'sourceKind') || null) as SourceKind | null,
        note: str(form, 'sourceNote') || null,
      }
    : null;
};

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export async function signInAction(form: FormData) {
  const ok = await signIn(str(form, 'token'));
  redirect(ok ? '/admin' : '/admin/login?error=1');
}

export async function signOutAction() {
  await signOut();
  redirect('/admin/login');
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export async function saveRecordAction(form: FormData) {
  const type = str(form, 'type') as EditableType;
  const id = num(form, 'id');
  if (!EDITABLE.includes(type) || !id) throw new Error('Bad request');
  const fields = str(form, 'fields').split(',').filter(Boolean);
  const values: Record<string, string> = {};
  for (const f of fields) values[f] = str(form, `f_${f}`);
  // Unchecked checkboxes send nothing; a listed boolean field missing means false.
  await attempt(
    form,
    async (editor) => {
      const patch = parseFields(type, values);
      const { changed } = await updateRecord(await getDb(), {
        type,
        id,
        patch,
        actor: editor,
        source: sourceFrom(form),
      });
      if (changed.length === 0) throw new EditError('Nothing changed.');
    },
    'Saved. Edited fields are now locked against imports.',
  );
}

export async function createRecordAction(form: FormData) {
  const type = str(form, 'type') as EditableType;
  if (!EDITABLE.includes(type)) throw new Error('Bad request');
  const fields = str(form, 'fields').split(',').filter(Boolean);
  const values: Record<string, string> = {};
  for (const f of fields) values[f] = str(form, `f_${f}`);
  const extra: Record<string, unknown> = {};
  if (type === 'token') extra.mint = str(form, 'mint');
  if (type === 'program') extra.address = str(form, 'address');
  await attempt(
    form,
    async (editor) => {
      const parsed = parseFields(type, values);
      const clean = Object.fromEntries(
        Object.entries(parsed).filter(([, v]) => v !== null && v !== ''),
      );
      const { id } = await createRecord(await getDb(), {
        type,
        values: clean,
        actor: editor,
        source: sourceFrom(form),
        extra,
      });
      return `/admin/edit/${type}/${id}`;
    },
    'Created.',
  );
}

export async function reviewAction(form: FormData) {
  const target = str(form, 'target') as ReviewTarget;
  const id = num(form, 'id');
  const status = str(form, 'status') as ReviewStatus;
  if (!REVIEWABLE.includes(target) || !id) throw new Error('Bad request');
  await attempt(
    form,
    async (editor) =>
      setReview(await getDb(), {
        target,
        id,
        status,
        actor: editor,
        note: str(form, 'note') || null,
      }),
    status === 'verified'
      ? 'Marked as checked.'
      : status === 'rejected'
        ? 'Rejected — it is hidden and imports will not bring it back.'
        : 'Flagged for review.',
  );
}

/** Confirm every listed item at once. */
export async function reviewManyAction(form: FormData) {
  const items = form
    .getAll('item')
    .map((v) => String(v).split(':'))
    .map(([target, id]) => ({ target: target as ReviewTarget, id: Number(id) }))
    .filter((i) => REVIEWABLE.includes(i.target) && Number.isInteger(i.id) && i.id > 0);
  const status = str(form, 'status') as ReviewStatus;
  await attempt(
    form,
    async (editor) => {
      if (items.length === 0) throw new EditError('Select at least one item.');
      await setReviewMany(await getDb(), items, status, editor);
    },
    `Updated ${items.length} item${items.length === 1 ? '' : 's'}.`,
  );
}

export async function unlockAction(form: FormData) {
  const type = str(form, 'type') as EditableType;
  const id = num(form, 'id');
  if (!EDITABLE.includes(type) || !id) throw new Error('Bad request');
  await attempt(
    form,
    async (editor) =>
      unlockField(await getDb(), { type, id, field: str(form, 'field'), actor: editor }),
    'Unlocked: imports may update it again.',
  );
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

export async function linkPersonAction(form: FormData) {
  const to = str(form, 'to') === 'organization' ? 'organization' : 'project';
  const targetId = num(form, 'targetId');
  if (!targetId) throw new Error('Bad request');
  await attempt(
    form,
    async (editor) => {
      await linkPerson(await getDb(), {
        to,
        targetId,
        person: { id: num(form, 'personId'), name: str(form, 'personName') || null },
        role: str(form, 'role'),
        isCurrent: str(form, 'isCurrent') !== 'no',
        startedOn: str(form, 'startedOn') || null,
        endedOn: str(form, 'endedOn') || null,
        source: sourceFrom(form),
        actor: editor,
      });
    },
    'Linked.',
  );
}

export async function addInvestorAction(form: FormData) {
  const roundId = num(form, 'roundId');
  if (!roundId) throw new Error('Bad request');
  await attempt(
    form,
    async (editor) => {
      await addRoundInvestor(await getDb(), {
        roundId,
        party: {
          type: str(form, 'partyType') === 'person' ? 'person' : 'organization',
          id: num(form, 'partyId'),
          name: str(form, 'partyName') || null,
        },
        isLead: str(form, 'isLead') === 'on',
        source: sourceFrom(form),
        actor: editor,
      });
    },
    'Investor added.',
  );
}

export async function linkProgramAction(form: FormData) {
  const projectId = num(form, 'projectId');
  if (!projectId) throw new Error('Bad request');
  await attempt(
    form,
    async (editor) => {
      await linkProgram(await getDb(), {
        projectId,
        address: str(form, 'address'),
        relation: str(form, 'relation') || 'operates',
        name: str(form, 'name') || null,
        note: str(form, 'note') || null,
        source: sourceFrom(form),
        actor: editor,
      });
    },
    'Program mapped.',
  );
}

export async function linkTokenAction(form: FormData) {
  const projectId = num(form, 'projectId');
  if (!projectId) throw new Error('Bad request');
  await attempt(
    form,
    async (editor) => {
      await linkToken(await getDb(), {
        projectId,
        mint: str(form, 'mint'),
        isPrimary: str(form, 'isPrimary') === 'on',
        source: sourceFrom(form),
        actor: editor,
      });
    },
    'Token mapped.',
  );
}

export async function updateLinkAction(form: FormData) {
  const target = str(form, 'target') as
    'project_person' | 'organization_person' | 'round_investor' | 'project_program';
  const id = num(form, 'id');
  if (
    !['project_person', 'organization_person', 'round_investor', 'project_program'].includes(
      target,
    ) ||
    !id
  )
    throw new Error('Bad request');
  const patch: Record<string, unknown> = {};
  for (const key of ['role', 'startedOn', 'endedOn', 'relation', 'note'])
    if (form.has(key)) patch[key] = str(form, key) || null;
  if (form.has('isCurrent')) patch.isCurrent = str(form, 'isCurrent') !== 'no';
  if (form.has('isLead')) patch.isLead = str(form, 'isLead') === 'yes';
  if (patch.role === null) delete patch.role;
  await attempt(
    form,
    async (editor) => updateLink(await getDb(), { target, id, patch, actor: editor }),
    'Connection updated.',
  );
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export async function addEvidenceAction(form: FormData) {
  const subjectType = str(form, 'subjectType') as SubjectType;
  const subjectId = num(form, 'subjectId');
  const source = sourceFrom(form);
  if (!subjectId) throw new Error('Bad request');
  await attempt(
    form,
    async (editor) => {
      if (!source) throw new EditError('Add the source link.');
      await addEvidence(await getDb(), {
        subjectType,
        subjectId,
        field: str(form, 'field'),
        source,
        actor: editor,
      });
    },
    'Source added.',
  );
}

export async function confirmEvidenceAction(form: FormData) {
  const evidenceId = num(form, 'evidenceId');
  if (!evidenceId) throw new Error('Bad request');
  await attempt(
    form,
    async (editor) => confirmEvidence(await getDb(), { evidenceId, actor: editor }),
    'Source confirmed.',
  );
}

export async function removeEvidenceAction(form: FormData) {
  const evidenceId = num(form, 'evidenceId');
  if (!evidenceId) throw new Error('Bad request');
  await attempt(
    form,
    async (editor) => removeEvidence(await getDb(), { evidenceId, actor: editor }),
    'Source removed.',
  );
}

export async function reviewSourceAction(form: FormData) {
  const sourceId = num(form, 'sourceId');
  if (!sourceId) throw new Error('Bad request');
  await attempt(
    form,
    async (editor) =>
      reviewSource(await getDb(), {
        sourceId,
        status: str(form, 'status'),
        kind: str(form, 'kind') || null,
        title: form.has('title') ? str(form, 'title') : undefined,
        notes: str(form, 'notes') || null,
        actor: editor,
      }),
    'Source reviewed.',
  );
}

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

export async function mergeAction(form: FormData) {
  const type = str(form, 'type') as MergeType;
  const winnerId = num(form, 'winnerId');
  const loserId = num(form, 'loserId');
  if (!['project', 'person', 'organization', 'round'].includes(type) || !winnerId || !loserId)
    throw new Error('Bad request');
  await attempt(
    form,
    async (editor) => mergeRecords(await getDb(), { type, winnerId, loserId, actor: editor }),
    'Merged. The old record now redirects to the one kept.',
  );
}

export async function dismissDuplicateAction(form: FormData) {
  const type = str(form, 'type') as MergeType;
  const a = num(form, 'a');
  const b = num(form, 'b');
  if (!a || !b) throw new Error('Bad request');
  await attempt(
    form,
    async (editor) => dismissDuplicate(await getDb(), { type, a, b, actor: editor }),
    'Marked as not duplicates; this pair will not be suggested again.',
  );
}

export async function convertAction(form: FormData) {
  const from = str(form, 'from') === 'person' ? 'person' : 'organization';
  const id = num(form, 'id');
  if (!id) throw new Error('Bad request');
  await attempt(
    form,
    async (editor) => {
      const converted = await convertParty(await getDb(), { from, id, actor: editor });
      return `/admin/edit/${from === 'organization' ? 'person' : 'organization'}/${converted.id}`;
    },
    'Converted.',
  );
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

/**
 * Start an import now. It runs after the response — an import can take
 * minutes — and its progress shows on the imports page.
 */
export async function runJobAction(form: FormData) {
  const job = str(form, 'job');
  await attempt(
    form,
    async (editor) => {
      const db = await getDb();
      after(async () => {
        await runJob(db, job, { env: jobEnv(), requestedBy: editor });
        clearReadCache();
      });
    },
    `Started ${job}. Refresh to follow its progress.`,
  );
}

/** Where an editor lands after editing a public record. */
export async function publicPathAction(form: FormData) {
  const type = str(form, 'type') as 'project' | 'person' | 'organization' | 'round';
  const id = num(form, 'id');
  await requireEditor();
  const slug = id ? await slugOf(await getDb(), type, id) : null;
  const prefix = {
    project: '/projects/',
    person: '/people/',
    organization: '/investors/',
    round: '/rounds/',
  }[type];
  redirect(slug ? `${prefix}${slug}` : '/admin');
}
