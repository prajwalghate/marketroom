import clsx from 'clsx';
import Link from 'next/link';
import { hrefWith, type Params } from '@/lib/query';

/**
 * Filter sidebar pieces shared by the database pages. Links, not form
 * controls: each option is the URL of the view it produces, so the current
 * state is always in the address bar and every view can be shared.
 */

export function OptionGroup({
  title,
  options,
  radio,
}: {
  title: string;
  options: { label: string; href: string; on: boolean; count?: number }[];
  radio?: boolean;
}) {
  return (
    <nav className="rx-filter" aria-label={title}>
      <span className="rx-filter-title">{title}</span>
      {options.map((o) => (
        <Link
          key={o.label}
          href={o.href}
          className={clsx('rx-option', radio && 'is-radio', o.on && 'is-on')}
          aria-current={o.on ? 'true' : undefined}
          prefetch={false}
        >
          <span className="rx-option-box" aria-hidden="true" />
          {o.label}
          {o.count !== undefined && <span className="rx-option-count">{o.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Pager({
  base,
  params,
  current,
  pages,
}: {
  base: string;
  params: Params;
  current: number;
  pages: number;
}) {
  if (pages <= 1) return null;
  const href = (n: number) => hrefWith(base, params, { page: n === 1 ? null : String(n) });
  const shown = [...new Set([1, current - 1, current, current + 1, pages])]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b);
  return (
    <nav className="rx-pager" aria-label="Pages">
      {current > 1 && (
        <Link href={href(current - 1)} prefetch={false}>
          Previous
        </Link>
      )}
      {shown.map((n, i) => (
        <span key={n} style={{ display: 'contents' }}>
          {i > 0 && n - shown[i - 1]! > 1 && <span aria-hidden="true">…</span>}
          {n === current ? (
            <span aria-current="page">{n}</span>
          ) : (
            <Link href={href(n)} prefetch={false}>
              {n}
            </Link>
          )}
        </span>
      ))}
      {current < pages && (
        <Link href={href(current + 1)} prefetch={false}>
          Next
        </Link>
      )}
    </nav>
  );
}

/** Shown while a dataset is being assembled for the first time after a deploy. */
export function Assembling({ what }: { what: string }) {
  return (
    <>
      {/* Reload in a little while: the assembly continues in the background. */}
      <meta httpEquiv="refresh" content="15" />
      <p className="rx-empty" role="status">
        {what} is being assembled from every project&rsquo;s public record — the first load after a
        deploy takes about a minute. This page will refresh by itself.
      </p>
    </>
  );
}
