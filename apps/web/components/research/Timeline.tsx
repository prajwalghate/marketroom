import type { CSSProperties, ReactNode } from 'react';
import { ScrollEnd } from './ScrollEnd';

/**
 * A horizontal timeline: dated stops along a line, each with a card. Used for
 * a project's funding rounds and its events. The row scrolls sideways when it
 * is longer than the column, and can be scrolled with the keyboard.
 */

export interface TimelineItem {
  readonly key: string;
  /** ISO date for the `<time>` element. */
  readonly date: string;
  readonly dateLabel: string;
  readonly title: ReactNode;
  readonly sub?: ReactNode;
  readonly foot?: ReactNode;
  /** The stop's colour; a `var(--mr-*)` value. */
  readonly tone?: string;
}

export function Timeline({
  items,
  label,
  startAtEnd = true,
}: {
  items: readonly TimelineItem[];
  label: string;
  /** Open scrolled to the latest stop; items run oldest to newest. */
  startAtEnd?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="rx-htl-wrap" role="region" aria-label={label} tabIndex={0}>
      <ol className="rx-htl">
        {items.map((i) => (
          <li
            key={i.key}
            style={i.tone ? ({ '--rx-tl-tone': i.tone } as CSSProperties) : undefined}
          >
            <span className="rx-htl-dot" aria-hidden="true" />
            <time dateTime={i.date} className="rx-htl-date mr-num">
              {i.dateLabel}
            </time>
            <div className="rx-htl-card">
              <span className="rx-htl-title">{i.title}</span>
              {i.sub && <span className="rx-htl-sub">{i.sub}</span>}
              {i.foot && <span className="rx-htl-foot">{i.foot}</span>}
            </div>
          </li>
        ))}
      </ol>
      {startAtEnd && <ScrollEnd />}
    </div>
  );
}
