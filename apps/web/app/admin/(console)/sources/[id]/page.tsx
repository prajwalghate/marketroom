import { loadSource, loadSourceUses } from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { methodLabel, sourceKindLabel } from '@/components/research/Evidence';
import { fmtDay } from '@/components/research/format';
import { getDb } from '@/lib/db';

export const metadata: Metadata = { title: 'Source' };
export const dynamic = 'force-dynamic';

const EDITABLE = ['project', 'person', 'organization', 'round', 'token', 'program', 'event'];

export default async function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sourceId = Number(id);
  if (!Number.isInteger(sourceId)) notFound();
  const db = await getDb();
  const [uses, source] = await Promise.all([
    loadSourceUses(db, sourceId),
    loadSource(db, sourceId),
  ]);
  if (!source) notFound();
  return (
    <section className="rx-sec">
      <header className="rx-sec-head">
        <h2 className="rx-sec-title">{source.publisher ?? source.title ?? 'Source'}</h2>
        <Link href="/admin/sources" className="rx-more" prefetch={false}>
          ← All sources
        </Link>
      </header>
      <p className="rx-sec-lead">
        {sourceKindLabel(source.kind)} ·{' '}
        <a className="rx-clear" href={source.url} target="_blank" rel="noopener noreferrer">
          {source.url}
        </a>
      </p>
      <div className="rx-table-wrap">
        <table className="rx-table">
          <thead>
            <tr>
              <th>Supports</th>
              <th>Field</th>
              <th>How</th>
              <th>Checked</th>
            </tr>
          </thead>
          <tbody>
            {uses.map((u, i) => (
              <tr key={i}>
                <td>
                  {EDITABLE.includes(u.subject_type) ? (
                    <Link
                      href={`/admin/edit/${u.subject_type}/${u.subject_id}`}
                      className="rx-clear-strong"
                      prefetch={false}
                    >
                      {u.label ?? `${u.subject_type} #${u.subject_id}`}
                    </Link>
                  ) : (
                    (u.label ?? `${u.subject_type} #${u.subject_id}`)
                  )}
                  <span className="rx-under">{u.subject_type.replace('_', ' ')}</span>
                </td>
                <td>{u.field || 'the record'}</td>
                <td>{methodLabel({ method: u.method as 'imported', checkedBy: u.checked_by })}</td>
                <td className="mr-num">{fmtDay(u.checked_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
