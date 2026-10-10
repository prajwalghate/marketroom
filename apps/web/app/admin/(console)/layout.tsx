import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { signOutAction } from '@/app/admin/actions';
import { AdminNav, Flash } from '@/components/admin/AdminChrome';
import { adminMode, requireEditor } from '@/lib/admin';
import { databaseInfo } from '@/lib/db';

export const metadata: Metadata = {
  title: { default: 'Editors', template: '%s · Editors' },
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const editor = await requireEditor();
  const mode = adminMode();
  const db = databaseInfo();
  return (
    <div className="mr-container rx-admin">
      {mode === 'open' && (
        <p className="rx-callout is-warn">
          Open editing: no editor tokens are configured, so anyone who can reach this development
          server can edit, as “local-editor”. Set <code>ADMIN_TOKENS</code> before deploying —
          without it, production has no editor dashboard at all.
        </p>
      )}
      {db.ephemeral && (
        <p className="rx-callout is-warn">
          This deployment stores the database on the instance’s temporary disk: edits will be lost
          when it restarts. Set <code>DATABASE_URL</code> to a Postgres database.
        </p>
      )}
      <header className="rx-admin-head">
        <div>
          <p className="rx-admin-kicker">Marketroom</p>
          <h1 className="rx-admin-title">Editors</h1>
        </div>
        <div className="rx-admin-who">
          Signed in as <strong>{editor}</strong>
          {mode === 'token' && (
            <form action={signOutAction} className="rx-inline-form">
              <button type="submit" className="rx-btn is-link">
                Sign out
              </button>
            </form>
          )}
          <Link href="/" className="rx-btn is-link">
            View site
          </Link>
        </div>
      </header>
      <AdminNav />
      <Suspense>
        <Flash />
      </Suspense>
      {children}
    </div>
  );
}
