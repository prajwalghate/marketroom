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
  { href: '/', label: 'Markets' },
  { href: '/trends', label: 'Trends' },
  { href: '/about', label: 'Method' },
];

export function PrimaryNav() {
  const pathname = usePathname();

  return (
    <nav className="mr-nav" aria-label="Primary">
      {NAV.map((item) => {
        // A market detail page belongs to Markets, so `/` matches `/market/...`
        // too — otherwise the deepest, most-visited view highlights nothing.
        const current =
          item.href === '/'
            ? pathname === '/' || pathname.startsWith('/market/')
            : pathname.startsWith(item.href);

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
  );
}
