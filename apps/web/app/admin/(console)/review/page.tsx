import { loadQueue, QUEUE_KINDS, type QueueKind, type ReviewTarget } from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { reviewManyAction } from '@/app/admin/actions';
import { Back, ReviewButtons } from '@/components/admin/Forms';
import { ReviewBadge } from '@/components/research/Evidence';
import { fmtDay } from '@/components/research/format';
import { Pager } from '@/components/sol/Filters';
import { one, pageOf, type Params } from '@/lib/query';
import { getDb } from '@/lib/db';

export const metadata: Metadata = { title: 'Review queue' };
export const dynamic = 'force-dynamic';

const PAGE = 40;

export default async function ReviewPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const kind = (QUEUE_KINDS.find((k) => k.kind === one(params.kind))?.kind ??
    'person') as QueueKind;
  const page = pageOf(params);
  const db = await getDb();
  const [queue, totals] = await Promise.all([
    loadQueue(db, kind, PAGE, (page - 1) * PAGE),
    Promise.all(
      QUEUE_KINDS.map(async (k) => ({
        kind: k.kind,
        total: (await loadQueue(db, k.kind, 1, 0)).total,
      })),
    ),
  ]);
  const about = QUEUE_KINDS.find((k) => k.kind === kind)!;
  const back = `/admin/review?kind=${kind}${page > 1 ? `&page=${page}` : ''}`;
  const target = kind as ReviewTarget;

  return (
    <>
      <nav className="rx-seg is-tabs" aria-label="Queue">
        {QUEUE_KINDS.map((k) => (
          <Link
            key={k.kind}
            href={`/admin/review?kind=${k.kind}`}
            aria-current={k.kind === kind ? 'true' : undefined}
            prefetch={false}
          >
            {k.label}{' '}
            <span className="rx-muted mr-num">
              {totals.find((t) => t.kind === k.kind)?.total ?? 0}
            </span>
          </Link>
        ))}
      </nav>
      <section className="rx-sec">
        <header className="rx-sec-head">
          <h2 className="rx-sec-title">
            {about.label}
            <span className="rx-sec-count">{queue.total}</span>
          </h2>
        </header>
        <p className="rx-sec-lead">
          {about.about} Confirming stamps your name and today’s date as the check; rejecting hides
          the item and keeps it as a tombstone so imports cannot bring it back.
        </p>
        {queue.items.length === 0 ? (
          <p className="rx-empty">Nothing waiting here.</p>
        ) : (
          <>
            <form action={reviewManyAction} id="bulk" className="rx-bulk">
              <input type="hidden" name="status" value="verified" />
              <Back to={back} />
              <button type="submit" className="rx-btn is-ok">
                ✓ Confirm selected
              </button>
              <span className="rx-muted">
                Tick the items you have checked against their sources.
              </span>
            </form>
            <ul className="rx-queue">
              {queue.items.map((item) => (
                <li key={item.id} id={`item-${item.id}`}>
                  <input
                    type="checkbox"
                    name="item"
                    value={`${target}:${item.id}`}
                    form="bulk"
                    aria-label={`Select ${item.title}`}
                  />
                  <div className="rx-queue-body">
                    <p className="rx-queue-title">
                      {item.publicHref ? (
                        <Link href={item.publicHref} className="rx-clear-strong" prefetch={false}>
                          {item.title}
                        </Link>
                      ) : (
                        <strong>{item.title}</strong>
                      )}{' '}
                      <ReviewBadge status={item.reviewStatus} compact />
                    </p>
                    {item.subtitle && <p className="rx-queue-sub">{item.subtitle}</p>}
                    {item.reason && <p className="rx-queue-reason">{item.reason}</p>}
                    <p className="rx-queue-meta">Added {fmtDay(item.createdAt)}</p>
                  </div>
                  <div className="rx-queue-actions">
                    <ReviewButtons
                      target={target}
                      id={item.id}
                      status={item.reviewStatus}
                      back={`${back}#item-${item.id}`}
                      compact
                    />
                    {['project', 'person', 'organization', 'round', 'event'].includes(kind) && (
                      <Link href={item.editHref} className="rx-btn is-quiet" prefetch={false}>
                        Edit
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Pager
              base="/admin/review"
              params={params}
              current={page}
              pages={Math.max(1, Math.ceil(queue.total / PAGE))}
            />
          </>
        )}
      </section>
    </>
  );
}
