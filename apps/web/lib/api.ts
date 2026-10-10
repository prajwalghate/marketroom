import 'server-only';

import type { WatchKey } from '@marketroom/db';
import { NextResponse } from 'next/server';

/**
 * JSON for the public API: cacheable at the edge for `maxAge` seconds, served
 * stale while it refreshes, and readable from any origin — it is meant for
 * other products to build on.
 */
export function apiJson(data: unknown, options: { maxAge?: number; status?: number } = {}) {
  const maxAge = options.maxAge ?? 60;
  return NextResponse.json(
    { ...((data as object) ?? {}), generatedAt: new Date().toISOString() },
    {
      status: options.status ?? 200,
      headers: {
        'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 5}`,
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}

export function apiError(status: number, message: string) {
  return NextResponse.json(
    { error: message },
    { status, headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } },
  );
}

export const intParam = (value: string | null, fallback: number, max: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : fallback;
};

/** `project:drift,investor:multicoin-capital` → watch keys. `investor` is an organisation. */
export function parseWatch(raw: string | null): WatchKey[] | undefined {
  if (!raw) return undefined;
  return raw
    .split(',')
    .map((s) => s.trim())
    .map((s) => {
      const i = s.indexOf(':');
      const type = s.slice(0, i) === 'investor' ? 'organization' : s.slice(0, i);
      return { type, slug: s.slice(i + 1) };
    })
    .filter(
      (w): w is WatchKey => ['project', 'person', 'organization'].includes(w.type) && !!w.slug,
    )
    .slice(0, 200);
}
