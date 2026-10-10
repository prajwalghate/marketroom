import { loadSources, SOURCE_KINDS, SOURCE_REVIEW } from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { reviewSourceAction } from '@/app/admin/actions';
import { Back } from '@/components/admin/Forms';
import { sourceKindLabel } from '@/components/research/Evidence';
import { ago } from '@/components/research/format';
import { SearchBox } from '@/components/research/Filters';
import { Pager } from '@/components/sol/Filters';
import { hrefWith, one, pageOf, type Params } from '@/lib/query';
import { getDb } from '@/lib/db';

export const metadata: Metadata = { title: 'Sources' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  unreviewed: 'Not reviewed',
  ok: 'Reliable',
  broken: 'Broken link',
  unreliable: 'Unreliable',
};

export default async function SourcesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const page = pageOf(params);
  const { rows, total, kinds } = await loadSources(await getDb(), {
    status: one(params.status) || undefined,
    kind: one(params.kind) || undefined,
    q: one(params.q) || undefined,
    page,
  });
  const back = hrefWith('/admin/sources', params, { page: page > 1 ? String(page) : null });

  return (
    <>
      <section className="rx-sec">
        <header className="rx-sec-head">
          <h2 className="rx-sec-title">
            Sources
            <span className="rx-sec-count">{total}</span>
          </h2>
        </header>
        <p className="rx-sec-lead">
          Every link the database cites. Mark a source reliable once you have read it, broken if it
          no longer resolves, unreliable if it should not back facts. Sources behind funding facts
          can only be announcements, press, filings, posts or funding databases.
        </p>
        <nav className="rx-seg" aria-label="Review status">
          <Link
            href={hrefWith('/admin/sources', params, { status: null })}
            aria-current={!one(params.status) ? 'true' : undefined}
            prefetch={false}
          >
            All
          </Link>
          {SOURCE_REVIEW.map((s) => (
            <Link
              key={s}
              href={hrefWith('/admin/sources', params, { status: s })}
              aria-current={one(params.status) === s ? 'true' : undefined}
              prefetch={false}
            >
              {STATUS_LABEL[s]}
            </Link>
          ))}
        </nav>
        <nav className="rx-seg" aria-label="Type">
          <Link
            href={hrefWith('/admin/sources', params, { kind: null })}
            aria-current={!one(params.kind) ? 'true' : undefined}
            prefetch={false}
          >
            Every type
          </Link>
          {kinds.map((k) => (
            <Link
              key={k.kind}
              href={hrefWith('/admin/sources', params, { kind: k.kind })}
              aria-current={one(params.kind) === k.kind ? 'true' : undefined}
              prefetch={false}
            >
              {sourceKindLabel(k.kind)} <span className="rx-muted mr-num">{k.count}</span>
            </Link>
          ))}
        </nav>
        <SearchBox
          base="/admin/sources"
          params={params}
          placeholder="Search by link, title or publisher"
          label="Search sources"
        />
        <div className="rx-table-wrap">
          <table className="rx-table">
            <thead>
              <tr>
                <th>Source</th>
                <th className="is-num">Facts</th>
                <th>Link check</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link
                      href={`/admin/sources/${s.id}`}
                      className="rx-strong-link"
                      prefetch={false}
                    >
                      {s.publisher ?? s.title ?? s.url}
                    </Link>
                    <span className="rx-under">
                      {sourceKindLabel(s.kind)} ·{' '}
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="rx-url">
                        {s.url}
                      </a>
                    </span>
                  </td>
                  <td className="is-num">{s.uses}</td>
                  <td>
                    {s.linkCheckedAt ? (
                      <span
                        className={s.httpStatus && s.httpStatus >= 400 ? 'rx-warn-text' : undefined}
                      >
                        HTTP {s.httpStatus ?? '?'} · {ago(s.linkCheckedAt)}
                      </span>
                    ) : (
                      <span className="rx-muted">Not checked</span>
                    )}
                  </td>
                  <td>
                    <form action={reviewSourceAction} className="rx-source-form">
                      <input type="hidden" name="sourceId" value={s.id} />
                      <Back to={back} />
                      <label className="sr-only" htmlFor={`st-${s.id}`}>
                        Review status
                      </label>
                      <select id={`st-${s.id}`} name="status" defaultValue={s.reviewStatus}>
                        {SOURCE_REVIEW.map((r) => (
                          <option key={r} value={r}>
                            {STATUS_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      <label className="sr-only" htmlFor={`kd-${s.id}`}>
                        Type
                      </label>
                      <select id={`kd-${s.id}`} name="kind" defaultValue={s.kind}>
                        {SOURCE_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {sourceKindLabel(k)}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="rx-btn">
                        Save
                      </button>
                      {s.reviewedBy && <span className="rx-under">by {s.reviewedBy}</span>}
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager
          base="/admin/sources"
          params={params}
          current={page}
          pages={Math.max(1, Math.ceil(total / 50))}
        />
      </section>
    </>
  );
}
