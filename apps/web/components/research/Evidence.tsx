import clsx from 'clsx';
import type { EvidenceRef, ReviewStatus } from '@marketroom/db';
import type { ReactNode } from 'react';
import { ago, fmtDay, fmtStamp, isoOf } from './format';

/**
 * How the site says where a fact came from.
 *
 * Every fact a reader can act on shows its sources one click away: who
 * published it, what kind of source that is, how we got it (imported, read
 * on-chain, inferred, or checked by an editor) and when. Disclosures are
 * native `<details>`, so they work without JavaScript and with a keyboard.
 */

const KIND_LABEL: Record<string, string> = {
  announcement: 'Announcement',
  press: 'Press',
  filing: 'Filing',
  social: 'Post',
  database: 'Database',
  api: 'Data feed',
  website: 'Website',
  repository: 'Code',
  registry: 'Registry',
  onchain: 'On-chain',
};

export const sourceKindLabel = (kind: string) => KIND_LABEL[kind] ?? kind;

export function methodLabel(e: Pick<EvidenceRef, 'method' | 'checkedBy'>): string {
  switch (e.method) {
    case 'editor':
      return `checked by ${e.checkedBy}`;
    case 'onchain':
      return 'read on-chain';
    case 'inferred':
      return 'inferred';
    default:
      return 'imported';
  }
}

/** One source, as a link: publisher, kind, and how and when it was checked. */
export function SourceLine({ e }: { e: EvidenceRef }) {
  return (
    <li className="rx-src">
      <a href={e.url} target="_blank" rel="noopener noreferrer" className="rx-src-link">
        {e.publisher ?? e.title ?? e.url}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      <span className={`rx-src-kind is-${e.kind}`}>{sourceKindLabel(e.kind)}</span>
      <span className="rx-src-meta">
        {methodLabel(e)} ·{' '}
        <time dateTime={isoOf(e.checkedAt)} title={fmtStamp(e.checkedAt)}>
          {fmtDay(e.checkedAt)}
        </time>
      </span>
      {e.note && <span className="rx-src-note">{e.note}</span>}
      {e.sourceReview === 'broken' && <span className="rx-src-flag">Link reported broken</span>}
    </li>
  );
}

/**
 * "2 sources" — a disclosure listing each one. With no evidence it says so
 * plainly instead of rendering nothing: an unsourced fact should look unsourced.
 */
export function Sources({
  evidence,
  label,
  align = 'start',
}: {
  evidence: readonly EvidenceRef[];
  label?: string;
  align?: 'start' | 'end';
}) {
  const unique = [...new Map(evidence.map((e) => [`${e.sourceId}:${e.method}`, e])).values()];
  if (unique.length === 0) return <span className="rx-nosrc">No source yet</span>;
  const first = unique[0]!;
  return (
    <details className={clsx('rx-ev', align === 'end' && 'is-end')}>
      <summary>
        <span className="rx-ev-pub">{label ?? first.publisher ?? sourceKindLabel(first.kind)}</span>
        {unique.length > 1 && <span className="rx-ev-more">+{unique.length - 1}</span>}
        <span className="sr-only">
          {' '}
          — show {unique.length === 1 ? 'the source' : `all ${unique.length} sources`}
        </span>
      </summary>
      <ul className="rx-ev-list">
        {unique.map((e) => (
          <SourceLine key={`${e.sourceId}:${e.field}:${e.method}`} e={e} />
        ))}
      </ul>
    </details>
  );
}

/** Where a record stands with the editors, in words. */
export function ReviewBadge({
  status,
  checkedAt,
  checkedBy,
  compact,
}: {
  status: ReviewStatus;
  checkedAt?: number | null;
  checkedBy?: string | null;
  compact?: boolean;
}) {
  if (status === 'verified') {
    const when = checkedAt ? fmtDay(checkedAt) : null;
    return (
      <span
        className="rx-badge is-verified"
        title={
          checkedAt ? `Checked by ${checkedBy ?? 'an editor'} on ${fmtStamp(checkedAt)}` : undefined
        }
      >
        <span aria-hidden="true">✓</span> {compact ? 'Checked' : `Checked${when ? ` ${when}` : ''}`}
      </span>
    );
  }
  if (status === 'needs_review') {
    return (
      <span
        className="rx-badge is-flag"
        title="Matched or guessed automatically. An editor has not confirmed it yet."
      >
        Unconfirmed
      </span>
    );
  }
  if (status === 'rejected') return <span className="rx-badge is-rejected">Rejected</span>;
  return (
    <span
      className="rx-badge is-imported"
      title="Imported from the sources listed. No editor has checked it yet."
    >
      {compact ? 'Imported' : 'Imported · not yet checked'}
    </span>
  );
}

/** "Jupiter · 4 min ago" — the provider and the time of a figure. */
export function Stamp({
  provider,
  at,
  providerAt,
}: {
  provider: string;
  at: number;
  providerAt?: number | null;
}) {
  return (
    <span className="rx-stamp">
      {provider} ·{' '}
      <time
        dateTime={isoOf(at)}
        title={`Fetched ${fmtStamp(at)}${providerAt ? `; reported by ${provider} at ${fmtStamp(providerAt)}` : ''}`}
      >
        {ago(at)}
      </time>
    </span>
  );
}

/**
 * Marks a figure as an estimate. The method is in the tooltip for pointer
 * users and read out in full to screen readers.
 */
export function Estimate({ method, children }: { method: string; children?: ReactNode }) {
  return (
    <span className="rx-est" title={method}>
      {children}
      <span className="rx-est-tag" aria-hidden="true">
        est.
      </span>
      <span className="sr-only"> (an estimate: {method})</span>
    </span>
  );
}

/** A plain-language warning or explanation inside a section. */
export function Callout({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'warn';
}) {
  return <p className={`rx-callout is-${tone}`}>{children}</p>;
}
