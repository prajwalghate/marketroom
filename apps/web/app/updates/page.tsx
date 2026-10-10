import { loadUpdates } from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { MarkSeen, MyUpdates } from '@/components/research/Updates';
import { ago, fmtDay, isoOf } from '@/components/research/format';
import { PageHead } from '@/components/sol/primitives';
import { hrefWith, one, type Params } from '@/lib/query';
import { researchDb } from '@/lib/research';

export const metadata: Metadata = {
  title: 'Updates',
  description:
    'What changed in the Solana research database: new rounds, team changes, program mappings, editor checks and news.',
};

export const dynamic = 'force-dynamic';

const ACTIONS: Record<string, string> = {
  'round.added': 'New round',
  'project.added': 'New project',
  'organization.added': 'New investor',
  'person.added': 'New person',
  'person.linked': 'Team',
  'program.linked': 'Program mapped',
  'record.verified': 'Checked',
  'record.updated': 'Corrected',
  'link.added': 'Connection',
  news: 'News',
};

export default async function UpdatesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const mine = one(params.mine) === '1';
  const kind = one(params.kind);
  const updates = mine ? [] : await loadUpdates(await researchDb(), { limit: 150 });
  const shown = updates.filter(
    (u) => !kind || (kind === 'news' ? u.kind === 'news' : u.kind === 'change'),
  );

  return (
    <div className="mr-container">
      <PageHead
        title="Updates"
        lead="What changed: rounds added, people linked to projects, programs mapped, profiles checked by an editor, and news that mentions a record. Watch a record to get its updates here and in the bell; follow any feed in a reader."
        meta={
          <a className="rx-clear" href="/updates/feed.xml">
            RSS feed of everything
          </a>
        }
      />
      <nav className="rx-seg is-tabs" aria-label="Which updates">
        <Link href="/updates?mine=1" aria-current={mine ? 'true' : undefined} prefetch={false}>
          For what I watch
        </Link>
        <Link href="/updates" aria-current={!mine && !kind ? 'true' : undefined} prefetch={false}>
          Everything
        </Link>
        <Link
          href={hrefWith('/updates', {}, { kind: 'change' })}
          aria-current={!mine && kind === 'change' ? 'true' : undefined}
          prefetch={false}
        >
          Database changes
        </Link>
        <Link
          href={hrefWith('/updates', {}, { kind: 'news' })}
          aria-current={!mine && kind === 'news' ? 'true' : undefined}
          prefetch={false}
        >
          News
        </Link>
      </nav>
      {mine ? (
        <>
          <MarkSeen />
          <MyUpdates />
        </>
      ) : shown.length === 0 ? (
        <p className="rx-empty">
          No updates in the last 90 days yet. The first import of each source writes no updates;
          changes after it do.
        </p>
      ) : (
        <ul className="rx-feed is-wide">
          {shown.map((u) => (
            <li key={u.id}>
              <time dateTime={isoOf(u.at)} title={fmtDay(u.at)}>
                {ago(u.at)}
              </time>
              <div>
                <span
                  className={`rx-kind is-${u.kind === 'news' ? 'news' : u.action.split('.')[0]}`}
                >
                  {ACTIONS[u.action] ?? u.action}
                </span>{' '}
                {u.subject && (
                  <Link
                    href={
                      u.subject.type === 'organization'
                        ? `/investors/${u.subject.slug}`
                        : u.subject.type === 'person'
                          ? `/people/${u.subject.slug}`
                          : u.subject.type === 'round'
                            ? `/rounds/${u.subject.slug}`
                            : `/projects/${u.subject.slug}`
                    }
                    className="rx-clear-strong"
                    prefetch={false}
                  >
                    {u.subject.name}
                  </Link>
                )}
                {u.subject && ' — '}
                {u.external ? (
                  <a
                    href={u.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rx-feed-title"
                  >
                    {u.title}
                  </a>
                ) : (
                  <Link href={u.url} className="rx-feed-title" prefetch={false}>
                    {u.title}
                  </Link>
                )}
                <span className="rx-feed-meta">
                  {u.publisher ??
                    (u.actor?.startsWith('import:')
                      ? 'from an import'
                      : u.actor
                        ? `by ${u.actor}`
                        : '')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
