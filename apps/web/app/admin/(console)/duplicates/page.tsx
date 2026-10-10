import { loadDuplicates, type DuplicateSide, type MergeType } from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { dismissDuplicateAction, mergeAction } from '@/app/admin/actions';
import { Back } from '@/components/admin/Forms';
import { ReviewBadge } from '@/components/research/Evidence';
import { one, type Params } from '@/lib/query';
import { getDb } from '@/lib/db';

export const metadata: Metadata = { title: 'Duplicates' };
export const dynamic = 'force-dynamic';

const TYPES: { type: MergeType; label: string; href: (slug: string) => string }[] = [
  { type: 'organization', label: 'Investors & organisations', href: (s) => `/investors/${s}` },
  { type: 'person', label: 'People', href: (s) => `/people/${s}` },
  { type: 'project', label: 'Projects', href: (s) => `/projects/${s}` },
  { type: 'round', label: 'Funding rounds', href: (s) => `/rounds/${s}` },
];

export default async function DuplicatesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const current = TYPES.find((t) => t.type === one(params.type)) ?? TYPES[0]!;
  const pairs = await loadDuplicates(await getDb(), current.type, 60);
  const back = `/admin/duplicates?type=${current.type}`;

  const Side = ({ s }: { s: DuplicateSide }) => (
    <div className="rx-dup-side">
      <Link href={current.href(s.slug)} className="rx-clear-strong" prefetch={false}>
        {s.name}
      </Link>
      <span className="rx-under">
        {s.detail || '—'} · {s.links} connection{s.links === 1 ? '' : 's'}
      </span>
      <ReviewBadge status={s.reviewStatus} compact />
    </div>
  );

  return (
    <>
      <nav className="rx-seg is-tabs" aria-label="Record type">
        {TYPES.map((t) => (
          <Link
            key={t.type}
            href={`/admin/duplicates?type=${t.type}`}
            aria-current={t.type === current.type ? 'true' : undefined}
            prefetch={false}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <section className="rx-sec">
        <header className="rx-sec-head">
          <h2 className="rx-sec-title">
            Possible duplicates
            <span className="rx-sec-count">{pairs.length}</span>
          </h2>
        </header>
        <p className="rx-sec-lead">
          Suggested by name, website or X account — only suggestions. Merging moves every
          connection, alias, mention and source to the record you keep; the other becomes a
          redirect, and its name keeps resolving so imports cannot recreate it. “Not duplicates”
          stops the pair being suggested again.
        </p>
        {pairs.length === 0 ? (
          <p className="rx-empty">No likely duplicates.</p>
        ) : (
          <ul className="rx-dups">
            {pairs.map((p) => (
              <li key={`${p.a.id}:${p.b.id}`}>
                <p className="rx-dup-why">{p.reasons.join(' · ')}</p>
                <div className="rx-dup-pair">
                  <Side s={p.a} />
                  <Side s={p.b} />
                </div>
                <div className="rx-review-buttons">
                  {[
                    [p.a, p.b],
                    [p.b, p.a],
                  ].map(([keep, drop]) => (
                    <form key={keep!.id} action={mergeAction} className="rx-inline-form">
                      <input type="hidden" name="type" value={current.type} />
                      <input type="hidden" name="winnerId" value={keep!.id} />
                      <input type="hidden" name="loserId" value={drop!.id} />
                      <Back to={back} />
                      <button type="submit" className="rx-btn">
                        Keep “{keep!.name}”, merge the other in
                      </button>
                    </form>
                  ))}
                  <form action={dismissDuplicateAction} className="rx-inline-form">
                    <input type="hidden" name="type" value={current.type} />
                    <input type="hidden" name="a" value={p.a.id} />
                    <input type="hidden" name="b" value={p.b.id} />
                    <Back to={back} />
                    <button type="submit" className="rx-btn is-quiet">
                      Not duplicates
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
