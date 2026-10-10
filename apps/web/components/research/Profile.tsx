import Link from 'next/link';
import type { ReactNode } from 'react';
import { Avatar } from '@/components/sol/Avatar';
import { hostname, twitterUrl } from './format';

/**
 * The frame every profile shares — project, person, investor, round, token,
 * program: a header with identity and the figures that matter, a sticky row
 * of section tabs, sections down the main column, and a sidebar of facts.
 */

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="rx-crumbs">
      <ol>
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`}>
            {item.href ? (
              <Link href={item.href} prefetch={false}>
                {item.label}
              </Link>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function ProfileHero({
  image,
  name,
  shape = 'square',
  title,
  extra,
  subtitle,
  badges,
  tags,
  links,
  actions,
  stats,
}: {
  image?: string | null;
  name: string;
  shape?: 'round' | 'square';
  title?: ReactNode;
  extra?: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  tags?: ReactNode;
  links?: ReactNode;
  actions?: ReactNode;
  stats?: ReactNode;
}) {
  return (
    <header className="rx-hero">
      <div className="rx-hero-top">
        <Avatar src={image ?? null} name={name} size={64} shape={shape} />
        <div className="rx-hero-id">
          <div className="rx-hero-titlerow">
            <h1 className="rx-hero-title">{title ?? name}</h1>
            {extra}
            {badges && <span className="rx-hero-badges">{badges}</span>}
          </div>
          {subtitle && <p className="rx-hero-sub">{subtitle}</p>}
          {tags && <div className="rx-tags rx-hero-tags">{tags}</div>}
          {links && <div className="rx-hero-links">{links}</div>}
        </div>
        {actions && <div className="rx-hero-actions">{actions}</div>}
      </div>
      {stats && <dl className="rx-hero-stats">{stats}</dl>}
    </header>
  );
}

export function HeroStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="rx-hero-stat">
      <dt>{label}</dt>
      <dd>
        <span className="rx-hero-stat-value mr-num">{value}</span>
        {sub && <span className="rx-hero-stat-sub">{sub}</span>}
      </dd>
    </div>
  );
}

/** Sticky in-page navigation; each tab is an anchor to a section. */
export function SectionTabs({
  items,
}: {
  items: { id: string; label: string; count?: number | null }[];
}) {
  return (
    <nav className="rx-stabs" aria-label="On this page">
      {items.map((item) => (
        <a key={item.id} href={`#${item.id}`}>
          {item.label}
          {item.count !== undefined && item.count !== null && (
            <span className="rx-stabs-count">{item.count}</span>
          )}
        </a>
      ))}
    </nav>
  );
}

export function Section({
  id,
  title,
  count,
  action,
  lead,
  children,
}: {
  id: string;
  title: string;
  count?: number | null;
  action?: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rx-sec" id={id} aria-labelledby={`${id}-h`}>
      <header className="rx-sec-head">
        <h2 id={`${id}-h`} className="rx-sec-title">
          {title}
          {count !== undefined && count !== null && <span className="rx-sec-count">{count}</span>}
        </h2>
        {action}
      </header>
      {lead && <p className="rx-sec-lead">{lead}</p>}
      {children}
    </section>
  );
}

export function ProfileLayout({
  main,
  aside,
  nav,
}: {
  main: ReactNode;
  aside: ReactNode;
  /** A section rail shown beside the content on wide screens. */
  nav?: ReactNode;
}) {
  return (
    <div className={nav ? 'rx-layout has-nav' : 'rx-layout'}>
      {nav && <div className="rx-layout-nav">{nav}</div>}
      <div className="rx-layout-main">{main}</div>
      <aside className="rx-layout-aside" aria-label="Profile details">
        {aside}
      </aside>
    </div>
  );
}

export function AsideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rx-aside-card" aria-label={title}>
      <h2 className="rx-aside-title">{title}</h2>
      {children}
    </section>
  );
}

/** Label / value pairs; a value may carry its own sources. */
export function Facts({
  items,
}: {
  items: { label: string; value: ReactNode; source?: ReactNode }[];
}) {
  const shown = items.filter((i) => i.value !== null && i.value !== undefined && i.value !== '');
  if (shown.length === 0) return null;
  return (
    <dl className="rx-kv">
      {shown.map((i) => (
        <div key={i.label} className="rx-kv-row">
          <dt>{i.label}</dt>
          <dd>
            {i.value}
            {i.source && <span className="rx-kv-src">{i.source}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** External links in a hero: a website, X, GitHub, docs. */
export function ExternalLinks({
  website,
  twitter,
  github,
  docs,
  discord,
  telegram,
  linkedin,
  more,
}: {
  website?: string | null;
  twitter?: string | null;
  github?: readonly string[] | string | null;
  docs?: string | null;
  discord?: string | null;
  telegram?: string | null;
  linkedin?: string | null;
  more?: { label: string; href: string }[];
}) {
  const githubs = (Array.isArray(github) ? github : github ? [github] : []) as string[];
  const links: { label: string; href: string; key: string }[] = [
    ...(website ? [{ key: 'web', label: hostname(website) ?? 'Website', href: website }] : []),
    ...(twitter
      ? [
          {
            key: 'x',
            label: `X @${twitter.replace(/^@/, '').replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//, '')}`,
            href: twitterUrl(twitter),
          },
        ]
      : []),
    ...githubs.slice(0, 2).map((g) => ({
      key: `gh-${g}`,
      label: `GitHub ${g}`,
      href: /^https?:/.test(g) ? g : `https://github.com/${g}`,
    })),
    ...(docs ? [{ key: 'docs', label: 'Docs', href: docs }] : []),
    ...(discord ? [{ key: 'discord', label: 'Discord', href: discord }] : []),
    ...(telegram ? [{ key: 'tg', label: 'Telegram', href: telegram }] : []),
    ...(linkedin ? [{ key: 'li', label: 'LinkedIn', href: linkedin }] : []),
    ...(more ?? []).map((m) => ({ ...m, key: m.href })),
  ];
  if (links.length === 0) return null;
  return (
    <>
      {links.map((l) => (
        <a key={l.key} href={l.href} className="rx-pill" target="_blank" rel="noopener noreferrer">
          {l.label}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ))}
    </>
  );
}

/** A notice for a dataset the first import has not reached yet. */
export function Building({ what, running }: { what: string; running: boolean }) {
  return (
    <>
      {running && <meta httpEquiv="refresh" content="20" />}
      <p className="rx-empty" role="status">
        {running
          ? `${what} is being imported from its public sources for the first time. This page refreshes itself; the first full pass takes a few minutes.`
          : `${what} has not been imported yet.`}
      </p>
    </>
  );
}
