import { importRunsOf, jobStatuses } from '@marketroom/db';
import type { Metadata } from 'next';
import { runJobAction } from '@/app/admin/actions';
import { Back } from '@/components/admin/Forms';
import { ago, fmtStamp } from '@/components/research/format';
import { getDb } from '@/lib/db';

export const metadata: Metadata = { title: 'Imports' };
export const dynamic = 'force-dynamic';

const HOUR = 3_600_000;

export default async function ImportsPage() {
  const db = await getDb();
  const [jobs, runs] = await Promise.all([jobStatuses(db), importRunsOf(db, 200)]);
  return (
    <>
      {jobs.map((j) => {
        const mine = runs.filter((r) => r.job === j.name).slice(0, 12);
        return (
          <section key={j.name} className="rx-sec" aria-labelledby={`job-${j.name}`}>
            <header className="rx-sec-head">
              <h2 className="rx-sec-title" id={`job-${j.name}`}>
                {j.label}
                <span className="rx-sec-count">
                  {j.everyMs >= HOUR
                    ? `every ${Math.round(j.everyMs / HOUR)} h`
                    : `every ${Math.round(j.everyMs / 60_000)} min`}
                </span>
              </h2>
              <form action={runJobAction} className="rx-inline-form">
                <input type="hidden" name="job" value={j.name} />
                <Back to="/admin/imports" />
                <button type="submit" className="rx-btn" disabled={j.last?.status === 'running'}>
                  Run now
                </button>
              </form>
            </header>
            <p className="rx-sec-lead">
              {j.description}
              {j.blockedBy.length > 0 && ` Waits for ${j.blockedBy.join(', ')} to succeed once.`}
              {j.due && ' Due now.'}
            </p>
            {mine.length === 0 ? (
              <p className="rx-empty">Never run.</p>
            ) : (
              <div className="rx-table-wrap">
                <table className="rx-table">
                  <thead>
                    <tr>
                      <th>Started</th>
                      <th>Took</th>
                      <th>Result</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mine.map((r) => (
                      <tr key={r.id}>
                        <td title={fmtStamp(r.startedAt.getTime())}>
                          {ago(r.startedAt.getTime())}
                        </td>
                        <td className="mr-num">
                          {r.finishedAt
                            ? `${((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000).toFixed(1)} s`
                            : '…'}
                        </td>
                        <td>
                          <span className={`rx-run is-${r.status}`}>{r.status}</span>
                        </td>
                        <td className="rx-run-details">
                          {r.error ??
                            Object.entries(r.stats ?? {})
                              .map(([k, v]) => `${k} ${v}`)
                              .join(' · ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
