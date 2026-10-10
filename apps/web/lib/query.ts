/**
 * URL-backed filter state for server-rendered database pages.
 *
 * Every filter is a link that changes one query parameter and keeps the rest,
 * so any filtered view is shareable, works without JavaScript, and survives a
 * reload. Changing a filter always returns to the first page.
 */

export type Params = Record<string, string | string[] | undefined>;

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export function hrefWith(
  base: string,
  params: Params,
  changes: Record<string, string | null>,
): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const value = one(v);
    if (value && k !== 'page') next.set(k, value);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === '') next.delete(k);
    else next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `${base}?${qs}` : base;
}

export const pageOf = (params: Params) => Math.max(1, Number(one(params.page)) || 1);
