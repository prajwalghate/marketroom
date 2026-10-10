import {
  EDITABLE_FIELDS,
  FUNDING_SOURCE_KINDS,
  loadChangeLog,
  loadEditable,
  loadInvestorProfile,
  loadPersonProfile,
  loadPickers,
  loadProgramProfile,
  loadProjectProfile,
  loadRoundProfile,
  type EditableType,
  type ReviewStatus,
} from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  addEvidenceAction,
  addInvestorAction,
  convertAction,
  createRecordAction,
  linkPersonAction,
  linkProgramAction,
  linkTokenAction,
  mergeAction,
  saveRecordAction,
  updateLinkAction,
} from '@/app/admin/actions';
import {
  Back,
  EvidenceTable,
  FieldInput,
  ReviewButtons,
  SourceFields,
} from '@/components/admin/Forms';
import { ReviewBadge } from '@/components/research/Evidence';
import { ago, fmtDay, shortAddress } from '@/components/research/format';
import { getDb } from '@/lib/db';

export const metadata: Metadata = { title: 'Edit' };
export const dynamic = 'force-dynamic';

const TYPES: EditableType[] = [
  'project',
  'person',
  'organization',
  'round',
  'token',
  'program',
  'event',
];
const LABEL: Record<EditableType, string> = {
  project: 'Project',
  person: 'Person',
  organization: 'Organisation',
  round: 'Funding round',
  token: 'Token',
  program: 'Program',
  event: 'Event',
};

type Props = { params: Promise<{ type: string; id: string }> };

export default async function EditPage({ params }: Props) {
  const { type: rawType, id: rawId } = await params;
  const type = rawType as EditableType;
  const id = Number(rawId);
  if (!TYPES.includes(type) || !Number.isInteger(id)) notFound();
  const db = await getDb();
  const [editable, pickers, history] = await Promise.all([
    loadEditable(db, type, id),
    loadPickers(db),
    loadChangeLog(db, { subjectType: type, subjectId: id }, 20),
  ]);
  if (!editable) notFound();
  const { record, evidence } = editable;
  const back = `/admin/edit/${type}/${id}`;
  const locked = new Set((record.lockedFields as string[] | undefined) ?? []);
  const status = (record.reviewStatus as ReviewStatus | undefined) ?? 'unreviewed';
  const name = String(
    record.name ??
      record.title ??
      record.symbol ??
      record.roundType ??
      record.address ??
      record.mint ??
      `#${id}`,
  );
  const publicHref =
    type === 'project'
      ? `/projects/${record.slug}`
      : type === 'person'
        ? `/people/${record.slug}`
        : type === 'organization'
          ? `/investors/${record.slug}`
          : type === 'round'
            ? `/rounds/${record.slug}`
            : type === 'token'
              ? `/tokens/${record.mint}`
              : type === 'program'
                ? `/programs/${record.address}`
                : null;
  const merged = record.mergedIntoId ? Number(record.mergedIntoId) : null;
  const fields = EDITABLE_FIELDS[type];

  let connections: ReactNode = null;
  if (type === 'project') connections = await ProjectConnections({ id, back, pickers });
  if (type === 'organization') connections = await OrganizationConnections({ id, back, pickers });
  if (type === 'person') connections = await PersonConnections({ id, back, pickers });
  if (type === 'round') connections = await RoundConnections({ id, back, pickers });
  if (type === 'program')
    connections = await ProgramConnections({ address: String(record.address), back });

  return (
    <>
      <header className="rx-edit-head">
        <div>
          <p className="rx-admin-kicker">{LABEL[type]}</p>
          <h2 className="rx-edit-title">{name}</h2>
          <p className="rx-under">
            <ReviewBadge
              status={status}
              checkedAt={record.checkedAt ? Date.parse(String(record.checkedAt)) : null}
              checkedBy={(record.checkedBy as string) ?? null}
            />{' '}
            {publicHref && (
              <Link href={publicHref} className="rx-clear" prefetch={false}>
                View public page
              </Link>
            )}
            {merged && <span className="rx-warn-text"> · merged into #{merged}</span>}
          </p>
        </div>
        <ReviewButtons target={type} id={id} status={status} back={back} />
      </header>

      <section className="rx-sec" aria-labelledby="fields-h">
        <header className="rx-sec-head">
          <h2 className="rx-sec-title" id="fields-h">
            Details
          </h2>
        </header>
        <p className="rx-sec-lead">
          Fields you change are locked against imports and recorded in the change log with a diff.
          Add the source that supports your change — it is shown to readers next to the field.
        </p>
        {fields.length === 0 ? null : (
          <form action={saveRecordAction} className="rx-edit-form">
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="fields" value={fields.map((f) => f.key).join(',')} />
            <Back to={back} />
            <div className="rx-field-grid">
              {fields.map((f) => (
                <FieldInput
                  key={f.key}
                  spec={f}
                  value={record[f.key]}
                  locked={locked.has(f.key)}
                  evidence={evidence}
                  projects={pickers.projects}
                  type={type}
                  id={id}
                  back={back}
                />
              ))}
            </div>
            <SourceFields kinds={type === 'round' ? FUNDING_SOURCE_KINDS : undefined} />
            <button type="submit" className="mr-btn mr-btn-primary">
              Save changes
            </button>
          </form>
        )}
        {type === 'token' && <p className="rx-under">Mint: {String(record.mint)}</p>}
        {type === 'program' && <p className="rx-under">Address: {String(record.address)}</p>}
      </section>

      <section className="rx-sec" aria-labelledby="sources-h">
        <header className="rx-sec-head">
          <h2 className="rx-sec-title" id="sources-h">
            Sources
            <span className="rx-sec-count">{evidence.length}</span>
          </h2>
        </header>
        <p className="rx-sec-lead">
          “I checked it” records that you read the source and it supports the fact — your name and
          today’s date replace the import’s.
        </p>
        <EvidenceTable evidence={evidence} back={back} />
        <form action={addEvidenceAction} className="rx-edit-form">
          <input type="hidden" name="subjectType" value={type} />
          <input type="hidden" name="subjectId" value={id} />
          <Back to={back} />
          <label className="rx-field">
            <span>Supports</span>
            <select name="field" defaultValue="">
              <option value="">The record as a whole</option>
              {fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <SourceFields
            required
            label="Add a source"
            kinds={type === 'round' ? FUNDING_SOURCE_KINDS : undefined}
          />
          <button type="submit" className="rx-btn">
            Add source
          </button>
        </form>
      </section>

      {connections}

      {(type === 'project' || type === 'person' || type === 'organization') && !merged && (
        <section className="rx-sec" aria-labelledby="merge-h">
          <header className="rx-sec-head">
            <h2 className="rx-sec-title" id="merge-h">
              Duplicate or wrong kind?
            </h2>
          </header>
          <form action={mergeAction} className="rx-edit-form is-row">
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="loserId" value={id} />
            <Back to={back} />
            <label className="rx-field is-wide">
              <span>This is a duplicate of — merge it into:</span>
              <select name="winnerId" required defaultValue="">
                <option value="" disabled>
                  Choose the record to keep
                </option>
                {(type === 'project'
                  ? pickers.projects
                  : type === 'person'
                    ? pickers.people
                    : pickers.organizations
                )
                  .filter((p) => p.id !== id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.slug})
                    </option>
                  ))}
              </select>
            </label>
            <button type="submit" className="rx-btn is-danger">
              Merge into it
            </button>
          </form>
          {(type === 'person' || type === 'organization') && (
            <form action={convertAction} className="rx-edit-form is-row">
              <input type="hidden" name="from" value={type} />
              <input type="hidden" name="id" value={id} />
              <Back to={back} />
              <p className="rx-sec-lead">
                {type === 'organization'
                  ? 'Imported as an organisation but really a person (an angel)? Converting moves every round it joined to a new person record.'
                  : 'Imported as a person but really a firm? Converting moves every round to a new organisation record.'}
              </p>
              <button type="submit" className="rx-btn">
                Convert to {type === 'organization' ? 'a person' : 'an organisation'}
              </button>
            </form>
          )}
        </section>
      )}

      <section className="rx-sec" aria-labelledby="history-h">
        <header className="rx-sec-head">
          <h2 className="rx-sec-title" id="history-h">
            History
          </h2>
        </header>
        {history.rows.length === 0 ? (
          <p className="rx-empty">No changes recorded yet.</p>
        ) : (
          <ul className="rx-changes">
            {history.rows.map((c) => (
              <li key={c.id}>
                <span>{c.summary}</span>
                <span className="rx-muted">
                  {c.actor} · {ago(c.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

type Pickers = Awaited<ReturnType<typeof loadPickers>>;

function NameList({ id, names }: { id: string; names: readonly { name: string }[] }) {
  return (
    <datalist id={id}>
      {names.map((n) => (
        <option key={n.name} value={n.name} />
      ))}
    </datalist>
  );
}

function RoleForm({
  to,
  targetId,
  back,
  pickers,
  personFixed,
}: {
  to: 'project' | 'organization';
  targetId?: number;
  back: string;
  pickers: Pickers;
  personFixed?: { id: number };
}) {
  return (
    <form action={linkPersonAction} className="rx-edit-form">
      <input type="hidden" name="to" value={to} />
      {targetId && <input type="hidden" name="targetId" value={targetId} />}
      {personFixed && <input type="hidden" name="personId" value={personFixed.id} />}
      <Back to={back} />
      <div className="rx-field-row">
        {!personFixed && (
          <label className="rx-field is-wide">
            <span>Person (existing name, or a new one)</span>
            <input type="text" name="personName" list="people-names" required />
          </label>
        )}
        {personFixed && (
          <label className="rx-field is-wide">
            <span>{to === 'project' ? 'Project' : 'Organisation'}</span>
            <select name="targetId" required defaultValue="">
              <option value="" disabled>
                Choose
              </option>
              {(to === 'project' ? pickers.projects : pickers.organizations).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="rx-field">
          <span>Role</span>
          <input type="text" name="role" required placeholder="Co-founder, CEO, Partner…" />
        </label>
        <label className="rx-field">
          <span>Current?</span>
          <select name="isCurrent" defaultValue="yes">
            <option value="yes">Current</option>
            <option value="no">Former</option>
          </select>
        </label>
        <label className="rx-field">
          <span>From</span>
          <input type="date" name="startedOn" />
        </label>
        <label className="rx-field">
          <span>Until</span>
          <input type="date" name="endedOn" />
        </label>
      </div>
      <SourceFields label="Source that names them in this role" />
      <button type="submit" className="rx-btn">
        Add
      </button>
      {!personFixed && <NameList id="people-names" names={pickers.people} />}
    </form>
  );
}

function RoleRows({
  rows,
  target,
  back,
}: {
  rows: {
    linkId: number;
    name: string;
    href: string;
    role: string;
    isCurrent: boolean;
    status: ReviewStatus;
    note?: string | null;
  }[];
  target: 'project_person' | 'organization_person';
  back: string;
}) {
  if (rows.length === 0) return <p className="rx-empty">None yet.</p>;
  return (
    <ul className="rx-queue">
      {rows.map((r) => (
        <li key={r.linkId}>
          <div className="rx-queue-body">
            <p className="rx-queue-title">
              <Link href={r.href} className="rx-clear-strong" prefetch={false}>
                {r.name}
              </Link>{' '}
              <ReviewBadge status={r.status} compact />
            </p>
            {r.note && <p className="rx-queue-reason">{r.note}</p>}
            <form action={updateLinkAction} className="rx-inline-form is-row">
              <input type="hidden" name="target" value={target} />
              <input type="hidden" name="id" value={r.linkId} />
              <Back to={back} />
              <label className="sr-only" htmlFor={`role-${r.linkId}`}>
                Role
              </label>
              <input id={`role-${r.linkId}`} type="text" name="role" defaultValue={r.role} />
              <label className="sr-only" htmlFor={`cur-${r.linkId}`}>
                Current
              </label>
              <select
                id={`cur-${r.linkId}`}
                name="isCurrent"
                defaultValue={r.isCurrent ? 'yes' : 'no'}
              >
                <option value="yes">Current</option>
                <option value="no">Former</option>
              </select>
              <button type="submit" className="rx-btn is-quiet">
                Save
              </button>
            </form>
          </div>
          <div className="rx-queue-actions">
            <ReviewButtons target={target} id={r.linkId} status={r.status} back={back} compact />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Section({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="rx-sec" aria-labelledby={`${id}-h`}>
      <header className="rx-sec-head">
        <h2 className="rx-sec-title" id={`${id}-h`}>
          {title}
          {count !== undefined && <span className="rx-sec-count">{count}</span>}
        </h2>
      </header>
      {children}
    </section>
  );
}

async function ProjectConnections({
  id,
  back,
  pickers,
}: {
  id: number;
  back: string;
  pickers: Pickers;
}) {
  const profile = await loadProjectProfile(await getDb(), id);
  if (!profile) return null;
  return (
    <>
      <Section id="team" title="Team" count={profile.team.length}>
        <RoleRows
          target="project_person"
          back={back}
          rows={profile.team.map((t) => ({
            linkId: t.linkId,
            name: t.person.name,
            href: `/admin/edit/person/${t.person.id}`,
            role: t.role,
            isCurrent: t.isCurrent,
            status: t.reviewStatus,
            note: t.evidence[0]?.note ?? null,
          }))}
        />
        <h3 className="rx-subsec-title">Add a team member</h3>
        <RoleForm to="project" targetId={id} back={back} pickers={pickers} />
      </Section>

      <Section id="rounds" title="Funding rounds" count={profile.rounds.length}>
        {profile.rounds.length > 0 && (
          <ul className="rx-queue">
            {profile.rounds.map((r) => (
              <li key={r.id}>
                <div className="rx-queue-body">
                  <p className="rx-queue-title">
                    <Link
                      href={`/admin/edit/round/${r.id}`}
                      className="rx-clear-strong"
                      prefetch={false}
                    >
                      {r.roundType ?? 'Round'} · {fmtDay(r.announcedOn)}
                    </Link>{' '}
                    <ReviewBadge status={r.reviewStatus} compact />
                  </p>
                  <p className="rx-queue-sub">
                    {r.investors.length} investors · {r.evidence.length} sources
                  </p>
                </div>
                <div className="rx-queue-actions">
                  <ReviewButtons
                    target="round"
                    id={r.id}
                    status={r.reviewStatus}
                    back={back}
                    compact
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <h3 className="rx-subsec-title">Add a round</h3>
        <form action={createRecordAction} className="rx-edit-form">
          <input type="hidden" name="type" value="round" />
          <input
            type="hidden"
            name="fields"
            value="roundType,amountUsd,valuationUsd,announcedOn,projectId"
          />
          <input type="hidden" name="f_projectId" value={id} />
          <Back to={back} />
          <div className="rx-field-row">
            <label className="rx-field">
              <span>Round type</span>
              <input type="text" name="f_roundType" placeholder="Seed, Series A…" />
            </label>
            <label className="rx-field">
              <span>Amount (USD)</span>
              <input
                type="text"
                inputMode="decimal"
                name="f_amountUsd"
                placeholder="Empty if undisclosed"
              />
            </label>
            <label className="rx-field">
              <span>Valuation (USD)</span>
              <input type="text" inputMode="decimal" name="f_valuationUsd" />
            </label>
            <label className="rx-field">
              <span>Announced on</span>
              <input type="date" name="f_announcedOn" required />
            </label>
          </div>
          <SourceFields required label="The announcement" kinds={FUNDING_SOURCE_KINDS} />
          <button type="submit" className="rx-btn">
            Add round
          </button>
        </form>
      </Section>

      <Section id="programs" title="Solana programs" count={profile.programs.length}>
        {profile.programs.length > 0 && (
          <ul className="rx-queue">
            {profile.programs.map((p) => (
              <li key={p.linkId}>
                <div className="rx-queue-body">
                  <p className="rx-queue-title">
                    <Link
                      href={`/admin/edit/program/${p.program.id}`}
                      className="rx-clear-strong"
                      prefetch={false}
                    >
                      {p.program.name ?? shortAddress(p.program.address)}
                    </Link>{' '}
                    <span className="rx-muted mr-num">{p.program.address}</span>{' '}
                    <ReviewBadge status={p.reviewStatus} compact />
                  </p>
                  {p.evidence[0]?.note && <p className="rx-queue-reason">{p.evidence[0].note}</p>}
                  <form action={updateLinkAction} className="rx-inline-form is-row">
                    <input type="hidden" name="target" value="project_program" />
                    <input type="hidden" name="id" value={p.linkId} />
                    <Back to={back} />
                    <label className="sr-only" htmlFor={`rel-${p.linkId}`}>
                      Relation
                    </label>
                    <select id={`rel-${p.linkId}`} name="relation" defaultValue={p.relation}>
                      <option value="operates">Operates</option>
                      <option value="uses">Uses</option>
                    </select>
                    <button type="submit" className="rx-btn is-quiet">
                      Save
                    </button>
                  </form>
                </div>
                <div className="rx-queue-actions">
                  <ReviewButtons
                    target="project_program"
                    id={p.linkId}
                    status={p.reviewStatus}
                    back={back}
                    compact
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <h3 className="rx-subsec-title">Map a program</h3>
        <form action={linkProgramAction} className="rx-edit-form">
          <input type="hidden" name="projectId" value={id} />
          <Back to={back} />
          <div className="rx-field-row">
            <label className="rx-field is-wide">
              <span>Program address</span>
              <input type="text" name="address" required pattern="[1-9A-HJ-NP-Za-km-z]{32,44}" />
            </label>
            <label className="rx-field">
              <span>Relation</span>
              <select name="relation" defaultValue="operates">
                <option value="operates">Operates it</option>
                <option value="uses">Uses it</option>
              </select>
            </label>
            <label className="rx-field">
              <span>Name</span>
              <input type="text" name="name" placeholder="Lending v2" />
            </label>
          </div>
          <SourceFields label="Source that lists this program (docs, verified build, explorer)" />
          <button type="submit" className="rx-btn">
            Map program
          </button>
        </form>
      </Section>

      <Section id="tokens" title="Tokens" count={profile.tokens.length}>
        {profile.tokens.length > 0 && (
          <ul className="rx-queue">
            {profile.tokens.map((t) => (
              <li key={t.id}>
                <div className="rx-queue-body">
                  <p className="rx-queue-title">
                    <Link
                      href={`/admin/edit/token/${t.id}`}
                      className="rx-clear-strong"
                      prefetch={false}
                    >
                      {t.symbol ?? shortAddress(t.mint)}
                    </Link>{' '}
                    <span className="rx-muted mr-num">{t.mint}</span>{' '}
                    {t.isPrimary && <span className="rx-chip-tag">Main</span>}{' '}
                    <ReviewBadge status={t.reviewStatus} compact />
                  </p>
                </div>
                <div className="rx-queue-actions">
                  <ReviewButtons
                    target="token"
                    id={t.id}
                    status={t.reviewStatus}
                    back={back}
                    compact
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <h3 className="rx-subsec-title">Map a token</h3>
        <form action={linkTokenAction} className="rx-edit-form">
          <input type="hidden" name="projectId" value={id} />
          <Back to={back} />
          <div className="rx-field-row">
            <label className="rx-field is-wide">
              <span>Mint address</span>
              <input type="text" name="mint" required pattern="[1-9A-HJ-NP-Za-km-z]{32,44}" />
            </label>
            <label className="rx-field rx-check-field">
              <input type="checkbox" name="isPrimary" /> <span>The project’s main token</span>
            </label>
          </div>
          <SourceFields label="Source that names this mint as the project’s token" />
          <button type="submit" className="rx-btn">
            Map token
          </button>
        </form>
      </Section>
    </>
  );
}

async function OrganizationConnections({
  id,
  back,
  pickers,
}: {
  id: number;
  back: string;
  pickers: Pickers;
}) {
  const profile = await loadInvestorProfile(await getDb(), id);
  if (!profile) return null;
  return (
    <>
      <Section id="team" title="Team" count={profile.team.length}>
        <RoleRows
          target="organization_person"
          back={back}
          rows={profile.team.map((t) => ({
            linkId: t.linkId,
            name: t.person.name,
            href: `/admin/edit/person/${t.person.id}`,
            role: t.role,
            isCurrent: t.isCurrent,
            status: t.reviewStatus,
          }))}
        />
        <h3 className="rx-subsec-title">Add a team member</h3>
        <RoleForm to="organization" targetId={id} back={back} pickers={pickers} />
      </Section>
      <Section id="deals" title="Deals" count={profile.deals.length}>
        {profile.deals.length === 0 ? (
          <p className="rx-empty">No rounds on record.</p>
        ) : (
          <ul className="rx-queue">
            {profile.deals.map((d) => (
              <li key={d.linkId}>
                <div className="rx-queue-body">
                  <p className="rx-queue-title">
                    <Link
                      href={`/admin/edit/round/${d.round.id}`}
                      className="rx-clear-strong"
                      prefetch={false}
                    >
                      {d.project.name} — {d.round.roundType ?? 'Round'} ·{' '}
                      {fmtDay(d.round.announcedOn)}
                    </Link>{' '}
                    {d.isLead && <span className="rx-chip-tag">Lead</span>}{' '}
                    <ReviewBadge status={d.reviewStatus} compact />
                  </p>
                </div>
                <div className="rx-queue-actions">
                  <ReviewButtons
                    target="round_investor"
                    id={d.linkId}
                    status={d.reviewStatus}
                    back={back}
                    compact
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

async function PersonConnections({
  id,
  back,
  pickers,
}: {
  id: number;
  back: string;
  pickers: Pickers;
}) {
  const profile = await loadPersonProfile(await getDb(), id);
  if (!profile) return null;
  return (
    <>
      <Section id="projects" title="Projects" count={profile.projects.length}>
        <RoleRows
          target="project_person"
          back={back}
          rows={profile.projects.map((r) => ({
            linkId: r.linkId,
            name: r.entity.name,
            href: `/admin/edit/project/${r.entity.id}`,
            role: r.role,
            isCurrent: r.isCurrent,
            status: r.reviewStatus,
            note: r.evidence[0]?.note ?? null,
          }))}
        />
        <h3 className="rx-subsec-title">Add a role at a project</h3>
        <RoleForm to="project" back={back} pickers={pickers} personFixed={{ id }} />
      </Section>
      <Section id="orgs" title="Organisations" count={profile.organizations.length}>
        <RoleRows
          target="organization_person"
          back={back}
          rows={profile.organizations.map((r) => ({
            linkId: r.linkId,
            name: r.entity.name,
            href: `/admin/edit/organization/${r.entity.id}`,
            role: r.role,
            isCurrent: r.isCurrent,
            status: r.reviewStatus,
          }))}
        />
        <h3 className="rx-subsec-title">Add a role at an organisation</h3>
        <RoleForm to="organization" back={back} pickers={pickers} personFixed={{ id }} />
      </Section>
      <Section id="investments" title="Personal investments" count={profile.investments.length}>
        {profile.investments.length === 0 ? (
          <p className="rx-empty">None on record.</p>
        ) : (
          <ul className="rx-queue">
            {profile.investments.map((i) => (
              <li key={i.linkId}>
                <div className="rx-queue-body">
                  <p className="rx-queue-title">
                    {i.project.name} — {i.round.roundType ?? 'Round'} ·{' '}
                    {fmtDay(i.round.announcedOn)} <ReviewBadge status={i.reviewStatus} compact />
                  </p>
                </div>
                <div className="rx-queue-actions">
                  <ReviewButtons
                    target="round_investor"
                    id={i.linkId}
                    status={i.reviewStatus}
                    back={back}
                    compact
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

async function RoundConnections({
  id,
  back,
  pickers,
}: {
  id: number;
  back: string;
  pickers: Pickers;
}) {
  const profile = await loadRoundProfile(await getDb(), id);
  if (!profile) return null;
  return (
    <Section id="investors" title="Investors" count={profile.investors.length}>
      {profile.investors.length > 0 && (
        <ul className="rx-queue">
          {profile.investors.map((i) => (
            <li key={i.linkId}>
              <div className="rx-queue-body">
                <p className="rx-queue-title">
                  <Link
                    href={`/admin/edit/${i.party.type}/${i.party.id}`}
                    className="rx-clear-strong"
                    prefetch={false}
                  >
                    {i.party.name}
                  </Link>{' '}
                  <span className="rx-muted">
                    {i.party.type === 'person' ? 'person' : 'organisation'}
                  </span>{' '}
                  <ReviewBadge status={i.reviewStatus} compact />
                </p>
                {i.nameAsReported && i.nameAsReported !== i.party.name && (
                  <p className="rx-queue-reason">Reported as “{i.nameAsReported}”</p>
                )}
                <form action={updateLinkAction} className="rx-inline-form is-row">
                  <input type="hidden" name="target" value="round_investor" />
                  <input type="hidden" name="id" value={i.linkId} />
                  <Back to={back} />
                  <label className="sr-only" htmlFor={`lead-${i.linkId}`}>
                    Lead
                  </label>
                  <select
                    id={`lead-${i.linkId}`}
                    name="isLead"
                    defaultValue={i.isLead ? 'yes' : 'no'}
                  >
                    <option value="yes">Lead</option>
                    <option value="no">Participant</option>
                  </select>
                  <button type="submit" className="rx-btn is-quiet">
                    Save
                  </button>
                </form>
              </div>
              <div className="rx-queue-actions">
                <ReviewButtons
                  target="round_investor"
                  id={i.linkId}
                  status={i.reviewStatus}
                  back={back}
                  compact
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <h3 className="rx-subsec-title">Add an investor</h3>
      <form action={addInvestorAction} className="rx-edit-form">
        <input type="hidden" name="roundId" value={id} />
        <Back to={back} />
        <div className="rx-field-row">
          <label className="rx-field">
            <span>Kind</span>
            <select name="partyType" defaultValue="organization">
              <option value="organization">Organisation</option>
              <option value="person">Person (angel)</option>
            </select>
          </label>
          <label className="rx-field is-wide">
            <span>Name (existing, or a new one)</span>
            <input type="text" name="partyName" list="party-names" required />
          </label>
          <label className="rx-field rx-check-field">
            <input type="checkbox" name="isLead" /> <span>Led the round</span>
          </label>
        </div>
        <SourceFields
          required
          label="The announcement that names them"
          kinds={FUNDING_SOURCE_KINDS}
        />
        <button type="submit" className="rx-btn">
          Add investor
        </button>
        <NameList id="party-names" names={[...pickers.organizations, ...pickers.people]} />
      </form>
    </Section>
  );
}

async function ProgramConnections({ address, back }: { address: string; back: string }) {
  const profile = await loadProgramProfile(await getDb(), address);
  if (!profile) return null;
  return (
    <Section id="projects" title="Projects" count={profile.projects.length}>
      {profile.projects.length === 0 ? (
        <p className="rx-empty">Not mapped. Map it from the project’s edit page.</p>
      ) : (
        <ul className="rx-queue">
          {profile.projects.map((p) => (
            <li key={p.linkId}>
              <div className="rx-queue-body">
                <p className="rx-queue-title">
                  <Link
                    href={`/admin/edit/project/${p.project.id}`}
                    className="rx-clear-strong"
                    prefetch={false}
                  >
                    {p.project.name}
                  </Link>{' '}
                  <span className="rx-muted">{p.relation}</span>{' '}
                  <ReviewBadge status={p.reviewStatus} compact />
                </p>
                {p.evidence[0]?.note && <p className="rx-queue-reason">{p.evidence[0].note}</p>}
              </div>
              <div className="rx-queue-actions">
                <ReviewButtons
                  target="project_program"
                  id={p.linkId}
                  status={p.reviewStatus}
                  back={back}
                  compact
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
