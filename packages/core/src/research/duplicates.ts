/**
 * Duplicate suggestions for editors.
 *
 * Imports arrive from several sources that spell the same thing differently
 * ("Multicoin", "Multicoin Capital"), so duplicates are a when, not an if.
 * This only proposes pairs, with the reason; an editor decides, and a pair
 * they reject is never proposed again.
 */

import { hostOf } from './sources';
import { looseKey, normalizeName } from './names';

export interface DuplicateRecord {
  readonly id: number;
  readonly name: string;
  readonly website?: string | null;
  readonly twitter?: string | null;
}

export type DuplicateReason = 'same name' | 'similar name' | 'same website' | 'same X account';

export interface DuplicatePair {
  readonly a: number;
  readonly b: number;
  readonly reasons: DuplicateReason[];
}

/** Hosts that many unrelated records share, so a match on them means nothing. */
const SHARED_HOSTS = new Set([
  'x.com',
  'twitter.com',
  'linktr.ee',
  'medium.com',
  'github.com',
  'notion.site',
  'gitbook.io',
  'mirror.xyz',
  'linkedin.com',
  't.me',
  'discord.gg',
  'discord.com',
]);

const handle = (twitter: string | null | undefined) =>
  twitter
    ?.trim()
    .replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase() || null;

const site = (website: string | null | undefined) => {
  if (!website) return null;
  const host = hostOf(/^https?:\/\//.test(website) ? website : `https://${website}`);
  return host && !SHARED_HOSTS.has(host) ? host : null;
};

export function duplicatePairs(
  records: readonly DuplicateRecord[],
  dismissed: ReadonlySet<string> = new Set(),
): DuplicatePair[] {
  const pairs = new Map<string, DuplicatePair>();
  const add = (ids: number[], reason: DuplicateReason) => {
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = Math.min(ids[i]!, ids[j]!);
        const b = Math.max(ids[i]!, ids[j]!);
        const key = `${a}:${b}`;
        if (a === b || dismissed.has(key)) continue;
        const pair = pairs.get(key) ?? { a, b, reasons: [] };
        if (!pair.reasons.includes(reason)) pair.reasons.push(reason);
        pairs.set(key, pair);
      }
    }
  };
  const group = (keyOf: (r: DuplicateRecord) => string | null, reason: DuplicateReason) => {
    const groups = new Map<string, number[]>();
    for (const r of records) {
      const key = keyOf(r);
      if (!key) continue;
      groups.set(key, [...(groups.get(key) ?? []), r.id]);
    }
    // A key shared by many records is a generic word, not an identity.
    for (const ids of groups.values()) if (ids.length > 1 && ids.length <= 4) add(ids, reason);
  };

  group((r) => normalizeName(r.name) || null, 'same name');
  group((r) => {
    const key = looseKey(r.name);
    return key.length >= 4 ? key : null;
  }, 'similar name');
  group((r) => site(r.website), 'same website');
  group((r) => handle(r.twitter), 'same X account');

  // "Same name" implies "similar name"; keep only the stronger reason.
  return [...pairs.values()]
    .map((p) =>
      p.reasons.includes('same name')
        ? { ...p, reasons: p.reasons.filter((r) => r !== 'similar name') }
        : p,
    )
    .sort((x, y) => y.reasons.length - x.reasons.length || x.a - y.a);
}

export const pairKey = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`;
