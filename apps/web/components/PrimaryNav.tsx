'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Primary navigation.
 *
 * A client component for one reason: the current route. Without it nothing in
 * the chrome says which section you are in — three identical links, no state —
 * and `aria-current` is the only thing that tells a screen-reader user where
 * they are in the site.
 *
 * `prefetch` is the App Router default; stated explicitly because instant
 * navigation is a product requirement here.
 */

const NAV = [
  { href: '/projects', label: 'Projects', also: [] },
  { href: '/fundraising', label: 'Fundraising', also: ['/rounds/'] },
  { href: '/investors', label: 'Investors', also: [] },
  { href: '/people', label: 'People', also: [] },
  { href: '/programs', label: 'Programs', also: [] },
  { href: '/calendar', label: 'Calendar', also: [] },
  { href: '/rankings', label: 'Rankings', also: [] },
];

/** Live market views and the tokenized-equities product, one click further. */
const MORE: { href: string; label: string; also?: string[] }[] = [
  { href: '/tokens', label: 'Tokens' },
  { href: '/updates', label: 'Updates' },
  { href: '/exchanges', label: 'Exchanges' },
  { href: '/staking', label: 'Staking' },
  { href: '/discover', label: 'Discover' },
  { href: '/compare', label: 'Compare' },
  // The tokenized-equities product keeps its own routes.
  { href: '/tokenized-assets', label: 'Tokenized assets', also: ['/market/', '/trends'] },
  { href: '/method', label: 'Method' },
  { href: '/api-docs', label: 'API' },
];

export function PrimaryNav() {
  const pathname = usePathname();

  return (
    <>
      <nav className="mr-nav" aria-label="Primary">
        {NAV.map((item) => {
          // A detail page belongs to its section — otherwise the deepest,
          // most-visited views highlight nothing.
          const current =
            pathname.startsWith(item.href) ||
            item.also.some((prefix) => pathname.startsWith(prefix));

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className="mr-nav-link"
              aria-current={current ? 'page' : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      {/* Outside the scrolling nav, so its menu is not clipped by it. */}
      <MoreMenu pathname={pathname} />
    </>
  );
}

const matches = (pathname: string, item: { href: string; also?: readonly string[] }) =>
  pathname.startsWith(item.href) || (item.also ?? []).some((prefix) => pathname.startsWith(prefix));

/**
 * "More" on wide screens: the secondary sections. On a phone there is no room
 * for the nav row at all, so the same menu becomes "Menu" and lists every
 * section, primary ones first.
 */
function MoreMenu({ pathname }: { pathname: string }) {
  const current = MORE.find((m) => matches(pathname, m));
  const currentPrimary = NAV.find((n) => matches(pathname, n));
  const link = (item: { href: string; label: string }, on: boolean) => (
    <Link
      key={item.href}
      href={item.href}
      prefetch={false}
      className="mr-nav-menu-link"
      aria-current={on ? 'page' : undefined}
    >
      {item.label}
    </Link>
  );
  return (
    // Keyed on the path so the menu closes after navigating.
    <details className="mr-nav-more" key={pathname}>
      <summary
        className="mr-nav-link"
        aria-current={current || currentPrimary ? 'page' : undefined}
      >
        <span className="mr-more-wide">{current ? current.label : 'More'}</span>
        <span className="mr-more-narrow">{currentPrimary?.label ?? current?.label ?? 'Menu'}</span>
      </summary>
      <div className="mr-nav-menu">
        <div className="mr-nav-menu-primary">{NAV.map((n) => link(n, n === currentPrimary))}</div>
        {MORE.map((m) => link(m, m === current))}
      </div>
    </details>
  );
}
