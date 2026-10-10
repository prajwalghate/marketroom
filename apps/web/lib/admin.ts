import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

/**
 * Who may edit.
 *
 * Editors are configured, not registered: `ADMIN_TOKENS="ana:<token>,ben:<token>"`
 * (or a single `ADMIN_TOKEN`, signed in as "admin"). Each editor's name goes
 * into the change log with every edit they make.
 *
 *  - Tokens configured → sign in with one.
 *  - None, in development → the dashboard is open to whoever runs the app
 *    locally, as "local-editor", with a banner saying so.
 *  - None, in production → the dashboard does not exist (404).
 */

const COOKIE = 'mr_editor';
const MIN_TOKEN_LENGTH = 16;

interface Editor {
  readonly name: string;
  readonly token: string;
}

function editors(): Editor[] {
  const list: Editor[] = [];
  for (const entry of (process.env.ADMIN_TOKENS ?? '').split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const i = trimmed.indexOf(':');
    list.push(
      i > 0
        ? { name: trimmed.slice(0, i).trim(), token: trimmed.slice(i + 1).trim() }
        : { name: 'editor', token: trimmed },
    );
  }
  if (process.env.ADMIN_TOKEN) list.push({ name: 'admin', token: process.env.ADMIN_TOKEN.trim() });
  // A short token is a guessable token; refuse it rather than accept it quietly.
  return list.filter((e) => e.token.length >= MIN_TOKEN_LENGTH && /^[\w.@-]{1,40}$/.test(e.name));
}

export type AdminMode = 'open' | 'token' | 'disabled';

export function adminMode(): AdminMode {
  if (editors().length) return 'token';
  return process.env.NODE_ENV === 'production' ? 'disabled' : 'open';
}

const digest = (token: string) =>
  createHash('sha256').update(`marketroom-editor:${token}`).digest();

function matchToken(token: string): Editor | null {
  const given = digest(token);
  let found: Editor | null = null;
  // Compare against every editor, so timing says nothing about which matched.
  for (const e of editors()) if (timingSafeEqual(given, digest(e.token))) found = e;
  return found;
}

export async function currentEditor(): Promise<string | null> {
  const mode = adminMode();
  if (mode === 'open') return 'local-editor';
  if (mode === 'disabled') return null;
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return null;
  const [name, hex] = value.split('|');
  if (!name || !hex || !/^[0-9a-f]{64}$/.test(hex)) return null;
  const given = Buffer.from(hex, 'hex');
  let found: string | null = null;
  for (const e of editors())
    if (timingSafeEqual(given, digest(e.token)) && e.name === name) found = e.name;
  return found;
}

/** The editor's name, or a redirect to sign in. Every admin page and action starts here. */
export async function requireEditor(): Promise<string> {
  if (adminMode() === 'disabled') notFound();
  const editor = await currentEditor();
  if (!editor) redirect('/admin/login');
  return editor;
}

export async function signIn(token: string): Promise<boolean> {
  const editor = matchToken(token.trim());
  if (!editor) return false;
  (await cookies()).set(COOKIE, `${editor.name}|${digest(editor.token).toString('hex')}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return true;
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
