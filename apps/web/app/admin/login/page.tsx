import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { signInAction } from '@/app/admin/actions';
import { PageHead } from '@/components/sol/primitives';
import { adminMode, currentEditor } from '@/lib/admin';
import { one, type Params } from '@/lib/query';

export const metadata: Metadata = {
  title: 'Editor sign-in',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<Params> }) {
  const mode = adminMode();
  if (mode === 'disabled') notFound();
  if (mode === 'open' || (await currentEditor())) redirect('/admin');
  const failed = one((await searchParams).error) === '1';
  return (
    <div className="mr-container rx-login">
      <PageHead
        title="Editor sign-in"
        lead="Editors correct profiles, review sources and merge duplicates. Every change is logged with your name."
      />
      <form action={signInAction} className="rx-sec rx-login-form">
        {failed && (
          <p className="rx-flash is-error" role="alert">
            That token is not recognised.
          </p>
        )}
        <label className="rx-field is-wide">
          <span>Editor token</span>
          <input
            type="password"
            name="token"
            required
            autoComplete="current-password"
            minLength={16}
          />
        </label>
        <button type="submit" className="mr-btn mr-btn-primary">
          Sign in
        </button>
      </form>
    </div>
  );
}
