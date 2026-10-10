'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

/** The editors' sections. */
const NAV = [
  { href: '/admin', label: 'Overview', exact: true },
  { href: '/admin/review', label: 'Review queue' },
  { href: '/admin/duplicates', label: 'Duplicates' },
  { href: '/admin/sources', label: 'Sources' },
  { href: '/admin/imports', label: 'Imports' },
  { href: '/admin/log', label: 'Change log' },
  { href: '/admin/new/project', label: 'Add a record' },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="rx-admin-nav" aria-label="Editors">
      {NAV.map((item) => {
        const on = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href.replace('/project', ''));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? 'page' : undefined}
            prefetch={false}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The outcome of the last action, from the redirect that followed it. */
export function Flash() {
  const params = useSearchParams();
  const ok = params.get('ok');
  const error = params.get('error');
  if (error) {
    return (
      <p className="rx-flash is-error" role="alert">
        {error}
      </p>
    );
  }
  if (ok) {
    return (
      <p className="rx-flash is-ok" role="status">
        {ok}
      </p>
    );
  }
  return null;
}
