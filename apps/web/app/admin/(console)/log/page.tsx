import { loadChangeLog, subjectNames, type SubjectType } from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { fmtStamp } from '@/components/research/format';
import { Pager } from '@/components/sol/Filters';
import { hrefWith, one, pageOf, type Params } from '@/lib/query';
import { getDb } from '@/lib/db';

export const metadata: Metadata = { title: 'Change log' };
export const dynamic = 'force-dynamic';

const EDITABLE = ['project', 'person', 'organization', 'round', 'token', 'program', 'event'];

export default async function LogPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const page = pageOf(params);
  const editorsOnly = one(params.editors) === '1';
  const db = await getDb();
  const { rows, total } = await loadChangeLog(
    db,
    { editorsOnly, actor: one(params.actor) || undefined, page },
    60,
  );
  const names = await subjectNames(
    db,
    rows
      .filter((r) => r.subjectType && r.subjectId)
      .map((r) => ({ type: r.subjectType as SubjectType, id: r.subjectId! })),
  );
  return (
    <section className="rx-sec">
      <header className="rx-sec-head">
        <h2 className="rx-sec-title">
          Change log
          <span className="rx-sec-count">{total}</span>
        </h2>
      </header>
      <p className="rx-sec-lead">
        Every change to the database, who made it — an editor or an import — and what it changed.
      </p>
      <nav className="rx-seg" aria-label="Who">
        <Link
          href="/admin/log"
          aria-current={!editorsOnly && !one(params.actor) ? 'true' : undefined}
          prefetch={false}
        >
          Everyone
        </Link>
        <Link
          href="/admin/log?editors=1"
          aria-current={editorsOnly ? 'true' : undefined}
          prefetch={false}
        >
          Editors only
        </Link>
      </nav>
      {rows.length === 0 ? (
        <p className="rx-empty">No changes yet.</p>
      ) : (
        <ul className="rx-log">
          {rows.map((r) => {
            const subject =
              r.subjectType && r.subjectId
                ? names.get(`${r.subjectType}:${r.subjectId}`)
                : undefined;
            return (
              <li key={r.id}>
                <div className="rx-log-head">
                  <time dateTime={new Date(r.at).toISOString()}>{fmtStamp(r.at)}</time>
                  <Link
                    href={hrefWith('/admin/log', {}, { actor: r.actor })}
                    className="rx-clear"
                    prefetch={false}
                  >
                    {r.actor}
                  </Link>
                  <span className="rx-muted">{r.action}</span>
                </div>
                <p>
                  {subject && (
                    <>
                      {r.subjectType && EDITABLE.includes(r.subjectType) ? (
                        <Link
                          href={`/admin/edit/${r.subjectType}/${r.subjectId}`}
                          className="rx-clear-strong"
                          prefetch={false}
                        >
                          {subject.name}
                        </Link>
                      ) : (
                        <strong>{subject.name}</strong>
                      )}
                      {' — '}
                    </>
                  )}
                  {r.summary}
                </p>
                {r.diff && Object.keys(r.diff).length > 0 && (
                  <dl className="rx-diff">
                    {Object.entries(r.diff).map(([field, d]) => (
                      <div key={field}>
                        <dt>{field}</dt>
                        <dd>
                          <del>{String(d.from ?? '—')}</del> → <ins>{String(d.to ?? '—')}</ins>
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Pager
        base="/admin/log"
        params={params}
        current={page}
        pages={Math.max(1, Math.ceil(total / 60))}
      />
    </section>
  );
}
