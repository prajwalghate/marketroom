import { jobStatuses, loadChangeLog, loadCounts, loadLinkCounts, loadStale } from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { runJobAction } from '@/app/admin/actions';
import { Back } from '@/components/admin/Forms';
import { ago, fmtDay, fmtStamp, isoOf } from '@/components/research/format';
import { databaseInfo, getDb, upkeepRunning } from '@/lib/db';

export const metadata: Metadata = { title: 'Overview' };
export const dynamic = 'force-dynamic';

const HOUR = 3_600_000;

const cadence = (ms: number) =>
  ms >= HOUR ? `every ${Math.round(ms / HOUR)} h` : `every ${Math.round(ms / 60_000)} min`;

export default async function AdminOverview() {
  const db = await getDb();
  const [counts, links, jobs, stale, editorLog, importLog] = await Promise.all([
    loadCounts(db),
    loadLinkCounts(db),
    jobStatuses(db),
    loadStale(db, 10),
    loadChangeLog(db, { editorsOnly: true }, 8),
    loadChangeLog(db, { actor: undefined }, 8),
  ]);
  const info = databaseInfo();
  const pendingTotal =
    counts.reduce((s, c) => s + c.unreviewed + c.needsReview, 0) +
    links.reduce((s, l) => s + l.pending, 0);

  return (
    <>
      <section className="rx-admin-grid" aria-label="Records">
        {counts.map((c) => {
          const pct = c.total ? Math.round((c.verified / c.total) * 100) : 0;
          return (
            <article key={c.type} className="rx-stat-card">
              <h2>{c.label}</h2>
              <p className="rx-stat-big mr-num">{c.total.toLocaleString('en-US')}</p>
              <div className="rx-progress" role="img" aria-label={`${pct}% checked by an editor`}>
                <span style={{ width: `${pct}%` }} />
              </div>
              <ul className="rx-stat-list">
                <li>
                  <span className="mr-num">{c.verified}</span> checked ({pct}%)
                </li>
                <li>
                  <Link href={`/admin/review?kind=${c.type}`} className="rx-clear" prefetch={false}>
                    <span className="mr-num">{c.unreviewed + c.needsReview}</span> to review
                  </Link>
                  {c.needsReview > 0 && (
                    <span className="rx-muted"> · {c.needsReview} flagged</span>
                  )}
                </li>
                {c.stale > 0 && (
                  <li className="rx-warn-text">
                    <span className="mr-num">{c.stale}</span> checks older than 90 days
                  </li>
                )}
              </ul>
            </article>
          );
        })}
      </section>

      <div className="rx-grid is-2">
        <section className="rx-sec" aria-labelledby="queue-h">
          <header className="rx-sec-head">
            <h2 className="rx-sec-title" id="queue-h">
              Connections awaiting review
              <span className="rx-sec-count">{pendingTotal}</span>
            </h2>
            <Link href="/admin/review" className="rx-more" prefetch={false}>
              Open the queue →
            </Link>
          </header>
          <ul className="rx-breakdown">
            {links.map((l) => (
              <li key={l.label}>
                <span>{l.label}</span>
                <span className="mr-num">
                  {l.pending} <span className="rx-muted">of {l.total}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rx-sec" aria-labelledby="stale-h">
          <header className="rx-sec-head">
            <h2 className="rx-sec-title" id="stale-h">
              Due for a re-check
            </h2>
          </header>
          {stale.length === 0 ? (
            <p className="rx-empty">No checked profile is overdue or changed since its check.</p>
          ) : (
            <ul className="rx-changes">
              {stale.map((s) => (
                <li key={`${s.type}:${s.id}`}>
                  <Link
                    href={`/admin/edit/${s.type}/${s.id}`}
                    className="rx-clear-strong"
                    prefetch={false}
                  >
                    {s.name}
                  </Link>
                  <span className="rx-muted">
                    checked {fmtDay(s.checkedAt)} by {s.checkedBy ?? '—'}
                    {s.changedSince > 0
                      ? ` · ${s.changedSince} import change${s.changedSince === 1 ? '' : 's'} since`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rx-sec" aria-labelledby="imports-h">
        <header className="rx-sec-head">
          <h2 className="rx-sec-title" id="imports-h">
            Imports {upkeepRunning() && <span className="rx-badge is-imported">running now</span>}
          </h2>
          <Link href="/admin/imports" className="rx-more" prefetch={false}>
            History →
          </Link>
        </header>
        <p className="rx-sec-lead">
          Data upkeep runs continuously: each source on its own schedule, stalest records first.
          Database: {info.driver === 'pglite' ? 'embedded Postgres (PGlite)' : 'Postgres'} at{' '}
          <code>{info.location}</code>.
        </p>
        <div className="rx-table-wrap">
          <table className="rx-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Schedule</th>
                <th>Last run</th>
                <th>Result</th>
                <th>
                  <span className="sr-only">Run</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.name}>
                  <td>
                    <strong>{j.label}</strong>
                    <span className="rx-under">{j.description}</span>
                  </td>
                  <td>{cadence(j.everyMs)}</td>
                  <td>
                    {j.last ? (
                      <time
                        dateTime={isoOf(j.last.startedAt.getTime())}
                        title={fmtStamp(j.last.startedAt.getTime())}
                      >
                        {ago(j.last.startedAt.getTime())}
                      </time>
                    ) : (
                      <span className="rx-muted">Never</span>
                    )}
                    {j.blockedBy.length > 0 && (
                      <span className="rx-under">waits for {j.blockedBy.join(', ')}</span>
                    )}
                  </td>
                  <td>
                    {j.last ? (
                      <>
                        <span className={`rx-run is-${j.last.status}`}>{j.last.status}</span>
                        <span className="rx-under">
                          {j.last.error
                            ? j.last.error.slice(0, 140)
                            : Object.entries(j.last.stats ?? {})
                                .slice(0, 4)
                                .map(([k, v]) => `${k} ${v}`)
                                .join(' · ')}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <form action={runJobAction} className="rx-inline-form">
                      <input type="hidden" name="job" value={j.name} />
                      <Back to="/admin" />
                      <button
                        type="submit"
                        className="rx-btn"
                        disabled={j.last?.status === 'running'}
                      >
                        Run now
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="rx-grid is-2">
        <LogPanel
          title="Latest editor changes"
          rows={editorLog.rows}
          empty="No editor has changed anything yet."
          more="/admin/log?editors=1"
        />
        <LogPanel
          title="Latest changes, all"
          rows={importLog.rows}
          empty="No changes yet."
          more="/admin/log"
        />
      </div>
    </>
  );
}

function LogPanel({
  title,
  rows,
  empty,
  more,
}: {
  title: string;
  rows: {
    id: number;
    at: number;
    actor: string;
    summary: string;
    subjectType: string | null;
    subjectId: number | null;
  }[];
  empty: string;
  more: string;
}) {
  return (
    <section className="rx-sec" aria-label={title}>
      <header className="rx-sec-head">
        <h2 className="rx-sec-title">{title}</h2>
        <Link href={more} className="rx-more" prefetch={false}>
          All →
        </Link>
      </header>
      {rows.length === 0 ? (
        <p className="rx-empty">{empty}</p>
      ) : (
        <ul className="rx-changes">
          {rows.map((r) => (
            <li key={r.id}>
              <span>
                {r.subjectType &&
                r.subjectId &&
                [
                  'project',
                  'person',
                  'organization',
                  'round',
                  'token',
                  'program',
                  'event',
                ].includes(r.subjectType) ? (
                  <Link
                    href={`/admin/edit/${r.subjectType}/${r.subjectId}`}
                    className="rx-clear-strong"
                    prefetch={false}
                  >
                    {r.summary}
                  </Link>
                ) : (
                  r.summary
                )}
              </span>
              <span className="rx-muted">
                {r.actor} · {ago(r.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
