import clsx from 'clsx';
import { formatCompactUsd } from '@marketroom/core';
import { loadCalendar, loadUpcoming, type CalendarItem } from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { projectHref, roundHref } from '@/components/research/Entities';
import { fmtDay } from '@/components/research/format';
import { AsideCard, ProfileLayout } from '@/components/research/Profile';
import { Avatar } from '@/components/sol/Avatar';
import { Empty, PageHead } from '@/components/sol/primitives';
import { hrefWith, one, type Params } from '@/lib/query';
import { researchDb } from '@/lib/research';

export const metadata: Metadata = {
  title: 'Calendar',
  description:
    'Solana funding rounds and events by date: rounds as announced, launches, milestones, incidents, conferences and hackathons.',
};

export const dynamic = 'force-dynamic';

const BASE = '/calendar';
const DAY = 86_400_000;

const TYPES: {
  id: string;
  label: string;
  color: string;
  test: (i: CalendarItem) => boolean;
}[] = [
  { id: 'funding', label: 'Funding', color: 'var(--mr-data-1)', test: (i) => i.kind === 'round' },
  {
    id: 'events',
    label: 'Conferences & hackathons',
    color: 'var(--mr-data-2)',
    test: (i) => i.kind === 'event' && ['conference', 'hackathon'].includes(i.eventKind),
  },
  {
    id: 'milestone',
    label: 'Milestones & launches',
    color: 'var(--mr-data-3)',
    test: (i) =>
      i.kind === 'event' &&
      ['milestone', 'launch', 'token_launch', 'upgrade', 'governance'].includes(i.eventKind),
  },
  {
    id: 'incident',
    label: 'Incidents',
    color: 'var(--mr-down)',
    test: (i) => i.kind === 'event' && i.eventKind === 'incident',
  },
];
const colorOf = (i: CalendarItem) => TYPES.find((t) => t.test(i))?.color ?? 'var(--mr-flat)';

const monthOf = (ms: number) => new Date(ms).toISOString().slice(0, 7);
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** The Monday on or before a day. */
const mondayOf = (day: string) => {
  const ms = Date.parse(`${day}T00:00:00Z`);
  return isoDay(ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY);
};
const addDays = (day: string, n: number) => isoDay(Date.parse(`${day}T00:00:00Z`) + n * DAY);
function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  return monthOf(Date.UTC(y!, m! - 1 + by, 1));
}
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    Date.parse(`${month}-01T00:00:00Z`),
  );
const dayLabel = (day: string) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(Date.parse(`${day}T00:00:00Z`));

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const now = Date.now();
  const requested = one(params.month);
  const weekParam = one(params.week);
  const weekMode = /^\d{4}-\d{2}-\d{2}$/.test(weekParam) && Number.isFinite(Date.parse(weekParam));
  const rolling = !weekMode && !/^\d{4}-\d{2}$/.test(requested);
  const today = isoDay(now);
  const month = weekMode ? weekParam.slice(0, 7) : rolling ? monthOf(now) : requested;
  const weekStart = mondayOf(weekMode ? weekParam : rolling ? today : `${month}-01`);
  const from = weekMode ? weekStart : rolling ? isoDay(now - 60 * DAY) : `${month}-01`;
  const to = weekMode
    ? addDays(weekStart, 7)
    : rolling
      ? isoDay(now + 60 * DAY)
      : `${shiftMonth(month, 1)}-01`;
  const type = TYPES.find((t) => t.id === one(params.type)) ?? null;

  const db = await researchDb();
  // The week strip may reach outside the listed range; load both.
  const [items, upcoming, stripItems] = await Promise.all([
    loadCalendar(db, from, to),
    loadUpcoming(db, today, 10),
    loadCalendar(db, weekStart, addDays(weekStart, 7)),
  ]);
  const shown = items.filter((i) => (!type || type.test(i)) && i.date < to);
  const days = new Map<string, CalendarItem[]>();
  for (const i of shown) days.set(i.date, [...(days.get(i.date) ?? []), i]);
  const strip = Array.from({ length: 7 }, (_, n) => {
    const day = addDays(weekStart, n);
    const list = stripItems.filter((i) => i.date === day && (!type || type.test(i)));
    return { day, list };
  });
  const weekLabel = `${new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(Date.parse(`${weekStart}T00:00:00Z`))} – ${new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(Date.parse(`${addDays(weekStart, 6)}T00:00:00Z`))}`;
  // Around today: what is coming first, then what just happened. A month or a
  // week reads in date order.
  const ordered = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const sections = rolling
    ? [
        {
          key: 'upcoming',
          title: 'Today and coming up',
          days: ordered.filter(([d]) => d >= today),
        },
        { key: 'recent', title: 'Recent', days: ordered.filter(([d]) => d < today).reverse() },
      ].filter((g) => g.days.length > 0)
    : [
        {
          key: 'period',
          title: weekMode ? `Week of ${weekLabel}` : monthLabel(month),
          days: ordered,
        },
      ];
  const dayHref = (day: string) =>
    days.has(day)
      ? `#d-${day}`
      : `${hrefWith(BASE, params, { week: mondayOf(day), month: null })}#d-${day}`;

  return (
    <div className="mr-container">
      <PageHead
        title="Calendar"
        lead="Funding rounds on the day they were announced, and the ecosystem’s dated events — launches, milestones, incidents, conferences and hackathons — each linked to its record and source."
      />
      <nav className="rx-week" aria-label={`Week of ${weekLabel}`}>
        <Link
          className="rx-week-arrow"
          href={hrefWith(BASE, params, { week: addDays(weekStart, -7), month: null })}
          prefetch={false}
        >
          <span aria-hidden="true">‹</span>
          <span className="sr-only">Previous week</span>
        </Link>
        <ol className="rx-week-days">
          {strip.map(({ day, list }) => (
            <li key={day}>
              <Link
                href={dayHref(day)}
                className={clsx(
                  'rx-week-day',
                  day === today && 'is-today',
                  list.length === 0 && 'is-quiet',
                )}
                aria-current={day === today ? 'date' : undefined}
                prefetch={false}
              >
                <span className="rx-week-dow">
                  {new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(
                    Date.parse(`${day}T00:00:00Z`),
                  )}
                </span>
                <span className="rx-week-num mr-num">{Number(day.slice(8))}</span>
                <span className="rx-week-dots" aria-hidden="true">
                  {list.slice(0, 5).map((i) => (
                    <span key={`${i.kind}-${i.slug}`} style={{ background: colorOf(i) }} />
                  ))}
                </span>
                <span className="rx-week-count">
                  {list.length
                    ? `${list.length} ${list.length === 1 ? 'item' : 'items'}`
                    : 'Nothing'}
                </span>
              </Link>
            </li>
          ))}
        </ol>
        <Link
          className="rx-week-arrow"
          href={hrefWith(BASE, params, { week: addDays(weekStart, 7), month: null })}
          prefetch={false}
        >
          <span aria-hidden="true">›</span>
          <span className="sr-only">Next week</span>
        </Link>
      </nav>
      <div className="rx-results-head">
        <nav className="rx-seg" aria-label="Month">
          <Link
            href={hrefWith(BASE, params, { month: shiftMonth(month, -1), week: null })}
            prefetch={false}
          >
            ← {monthLabel(shiftMonth(month, -1))}
          </Link>
          <Link
            href={hrefWith(BASE, params, { month: null, week: null })}
            aria-current={rolling ? 'true' : undefined}
            prefetch={false}
          >
            Around today
          </Link>
          {weekMode && <span aria-current="true">Week of {weekLabel}</span>}
          {!rolling && !weekMode && <span aria-current="true">{monthLabel(month)}</span>}
          <Link
            href={hrefWith(BASE, params, { month: shiftMonth(month, 1), week: null })}
            prefetch={false}
          >
            {monthLabel(shiftMonth(month, 1))} →
          </Link>
        </nav>
        <nav className="rx-seg" aria-label="Type">
          <Link
            href={hrefWith(BASE, params, { type: null })}
            aria-current={!type ? 'true' : undefined}
            prefetch={false}
          >
            All
          </Link>
          {TYPES.map((t) => (
            <Link
              key={t.id}
              href={hrefWith(BASE, params, { type: t.id })}
              aria-current={type?.id === t.id ? 'true' : undefined}
              prefetch={false}
            >
              <span className="rx-legend-dot" style={{ background: t.color }} aria-hidden="true" />{' '}
              {t.label} <span className="rx-muted mr-num">{items.filter(t.test).length}</span>
            </Link>
          ))}
        </nav>
      </div>
      <ProfileLayout
        main={
          days.size === 0 ? (
            <Empty>Nothing dated in this period{type ? ' for this type' : ''}.</Empty>
          ) : (
            <div className="rx-days">
              {sections.map((sec) => (
                <section
                  key={sec.key}
                  aria-labelledby={`days-${sec.key}`}
                  className="rx-days-group"
                >
                  <h2 className="rx-days-head" id={`days-${sec.key}`}>
                    {sec.title}
                  </h2>
                  {sec.days.map(([day, list]) => (
                    <section
                      key={day}
                      id={`d-${day}`}
                      aria-labelledby={`d-${day}-h`}
                      className={clsx(
                        'rx-day',
                        day === today && 'is-today',
                        day > today && 'is-future',
                      )}
                    >
                      <h3 className="rx-day-title" id={`d-${day}-h`}>
                        <time dateTime={day}>{dayLabel(day)}</time>
                        {day === today && <span className="rx-chip-tag"> Today</span>}
                        <span className="rx-muted"> · {list.length}</span>
                      </h3>
                      <ul className="rx-agenda">
                        {list.map((i) => (
                          <li
                            key={`${i.kind}-${i.slug}`}
                            style={{ '--rx-tl-tone': colorOf(i) } as React.CSSProperties}
                          >
                            {i.kind === 'round' ? <RoundItem i={i} /> : <EventItem i={i} />}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </section>
              ))}
            </div>
          )
        }
        aside={
          <>
            <AsideCard title="Coming up">
              {upcoming.length === 0 ? (
                <p className="rx-aside-text">No upcoming events on record.</p>
              ) : (
                <ul className="rx-aside-list">
                  {upcoming.map((e) => (
                    <li key={e.slug}>
                      <span className="rx-aside-date mr-num">{fmtDay(e.date)}</span>
                      {e.url ? (
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rx-clear-strong"
                        >
                          {e.title}
                        </a>
                      ) : (
                        <span>{e.title}</span>
                      )}
                      {e.location && <span className="rx-muted"> · {e.location}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </AsideCard>
            <AsideCard title="Follow">
              <p className="rx-aside-text">
                New rounds and events also appear in{' '}
                <Link className="rx-clear" href="/updates">
                  Updates
                </Link>{' '}
                and its{' '}
                <a className="rx-clear" href="/updates/feed.xml">
                  RSS feed
                </a>
                .
              </p>
            </AsideCard>
          </>
        }
      />
    </div>
  );
}

function RoundItem({ i }: { i: Extract<CalendarItem, { kind: 'round' }> }) {
  return (
    <>
      <Avatar src={i.project.logoUrl} name={i.project.name} size={32} shape="square" />
      <span className="rx-agenda-body">
        <span className="rx-agenda-title">
          <Link href={projectHref(i.project.slug)} className="rx-clear-strong" prefetch={false}>
            {i.project.name}
          </Link>
          <span className="rx-kind is-funding">{i.roundType ?? 'Funding'}</span>
        </span>
        <span className="rx-agenda-sub">
          Raised{' '}
          <strong className="mr-num">
            {i.amountUsd ? formatCompactUsd(i.amountUsd) : 'an undisclosed amount'}
          </strong>
          {i.leads.length ? `, led by ${i.leads.slice(0, 2).join(' and ')}` : ''}
          {i.project.category ? <span className="rx-muted"> · {i.project.category}</span> : null}
        </span>
      </span>
      <Link href={roundHref(i.slug)} className="rx-agenda-more" prefetch={false}>
        Round
        <span className="sr-only"> details for {i.project.name}</span>
      </Link>
    </>
  );
}

const KIND: Record<string, string> = {
  launch: 'Launch',
  token_launch: 'Token launch',
  upgrade: 'Upgrade',
  milestone: 'Milestone',
  incident: 'Incident',
  governance: 'Governance',
  conference: 'Conference',
  hackathon: 'Hackathon',
  other: 'Event',
};

function EventItem({ i }: { i: Extract<CalendarItem, { kind: 'event' }> }) {
  // Confirmed links come first; a name match is shown as one, never as fact.
  const project = i.projects[0];
  return (
    <>
      {project && !project.unconfirmed ? (
        <Avatar src={project.logoUrl} name={project.name} size={32} shape="square" />
      ) : (
        <span className="rx-agenda-icon" aria-hidden="true">
          {(KIND[i.eventKind] ?? 'Event').slice(0, 1)}
        </span>
      )}
      <span className="rx-agenda-body">
        <span className="rx-agenda-title">
          {i.url ? (
            <a href={i.url} target="_blank" rel="noopener noreferrer" className="rx-clear-strong">
              {i.title}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <span className="rx-strong">{i.title}</span>
          )}
          <span className={`rx-kind is-${i.eventKind}`}>{KIND[i.eventKind] ?? i.eventKind}</span>
        </span>
        <span className="rx-agenda-sub">
          {project && (
            <>
              {project.unconfirmed && 'Possibly '}
              <Link href={projectHref(project.slug)} className="rx-clear" prefetch={false}>
                {project.name}
              </Link>
              {project.unconfirmed && (
                <span className="rx-muted"> (matched by name, unconfirmed)</span>
              )}
            </>
          )}
          {i.amountUsd ? (
            <strong className="mr-num rx-down">
              {project ? ' · ' : ''}
              {formatCompactUsd(i.amountUsd)} lost
            </strong>
          ) : null}
          {i.location && (
            <span className="rx-muted">
              {project || i.amountUsd ? ' · ' : ''}
              {i.location}
            </span>
          )}
          {i.endsOn && i.endsOn !== i.date && (
            <span className="rx-muted"> · until {fmtDay(i.endsOn)}</span>
          )}
        </span>
      </span>
      <span />
    </>
  );
}
