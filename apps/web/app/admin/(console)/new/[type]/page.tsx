import {
  EDITABLE_FIELDS,
  FUNDING_SOURCE_KINDS,
  loadPickers,
  type EditableType,
} from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createRecordAction } from '@/app/admin/actions';
import { Back, FieldInput, SourceFields } from '@/components/admin/Forms';
import { getDb } from '@/lib/db';

export const metadata: Metadata = { title: 'Add a record' };
export const dynamic = 'force-dynamic';

const TYPES: { type: EditableType; label: string; about: string }[] = [
  {
    type: 'project',
    label: 'Project',
    about: 'A team building on Solana that the imports have not found — or not yet.',
  },
  {
    type: 'organization',
    label: 'Investor / organisation',
    about: 'A fund, firm, foundation or company.',
  },
  {
    type: 'person',
    label: 'Person',
    about:
      'A founder, team member, partner or angel. Connect them to projects from their edit page.',
  },
  {
    type: 'round',
    label: 'Funding round',
    about: 'Needs its announcement. Add investors from the round’s edit page.',
  },
  {
    type: 'event',
    label: 'Event',
    about: 'A launch, milestone, incident, conference or hackathon.',
  },
  { type: 'token', label: 'Token', about: 'A mint address and the project it belongs to.' },
  {
    type: 'program',
    label: 'Program',
    about: 'A Solana program address. Map it to projects from their edit pages.',
  },
];

export default async function NewRecordPage({ params }: { params: Promise<{ type: string }> }) {
  const { type: raw } = await params;
  const current = TYPES.find((t) => t.type === raw);
  if (!current) notFound();
  const pickers = await loadPickers(await getDb());
  const fields = EDITABLE_FIELDS[current.type];
  const back = `/admin/new/${current.type}`;

  return (
    <>
      <nav className="rx-seg is-tabs" aria-label="Record type">
        {TYPES.map((t) => (
          <Link
            key={t.type}
            href={`/admin/new/${t.type}`}
            aria-current={t.type === current.type ? 'true' : undefined}
            prefetch={false}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <section className="rx-sec">
        <header className="rx-sec-head">
          <h2 className="rx-sec-title">New {current.label.toLowerCase()}</h2>
        </header>
        <p className="rx-sec-lead">
          {current.about} With a source it starts as checked by you; without one it is flagged for
          review. Every field you fill is locked against imports.
        </p>
        <form action={createRecordAction} className="rx-edit-form">
          <input type="hidden" name="type" value={current.type} />
          <input type="hidden" name="fields" value={fields.map((f) => f.key).join(',')} />
          <Back to={back} />
          {current.type === 'token' && (
            <label className="rx-field is-wide">
              <span>Mint address *</span>
              <input type="text" name="mint" required pattern="[1-9A-HJ-NP-Za-km-z]{32,44}" />
            </label>
          )}
          {current.type === 'program' && (
            <label className="rx-field is-wide">
              <span>Program address *</span>
              <input type="text" name="address" required pattern="[1-9A-HJ-NP-Za-km-z]{32,44}" />
            </label>
          )}
          <div className="rx-field-grid">
            {fields.map((f) => (
              <FieldInput
                key={f.key}
                spec={f}
                value={null}
                locked={false}
                evidence={[]}
                projects={pickers.projects}
                type={current.type}
                id={0}
                back={back}
              />
            ))}
          </div>
          <SourceFields
            required={current.type === 'round'}
            kinds={current.type === 'round' ? FUNDING_SOURCE_KINDS : undefined}
          />
          <button type="submit" className="mr-btn mr-btn-primary">
            Create
          </button>
        </form>
      </section>
    </>
  );
}
