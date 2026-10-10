/**
 * How recently a profile was checked by a person.
 *
 * Imports refresh numbers continuously; they do not re-read an announcement
 * or confirm someone still works somewhere. "Checked" means an editor looked,
 * and a profile nobody has looked at in a quarter says so.
 */

export type Freshness = 'fresh' | 'aging' | 'stale' | 'never';

const DAY_MS = 86_400_000;

export const FRESHNESS_DAYS = { fresh: 30, aging: 90 } as const;

export function freshness(checkedAt: number | null, nowMs: number): Freshness {
  if (checkedAt === null) return 'never';
  const age = nowMs - checkedAt;
  if (age < FRESHNESS_DAYS.fresh * DAY_MS) return 'fresh';
  if (age < FRESHNESS_DAYS.aging * DAY_MS) return 'aging';
  return 'stale';
}
