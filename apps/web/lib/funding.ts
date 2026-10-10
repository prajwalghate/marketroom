import type { RoundRow } from '@marketroom/db';

/**
 * Funding over time, shaped for charts: disclosed amounts per month split by
 * project category, the number of rounds per month, and rounds by type.
 * Only disclosed amounts are summed; a round without one still counts as a
 * round.
 */

/** The last `n` calendar months as `YYYY-MM`, oldest first. */
export function lastMonths(n: number, now = Date.now()): string[] {
  const d = new Date(now);
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (n - 1) + i, 1))
      .toISOString()
      .slice(0, 7),
  );
}

/** "Mar '25" — short enough for an axis, unambiguous about the year. */
export const monthLabel = (m: string) =>
  `${new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(
    Date.parse(`${m}-01T00:00:00Z`),
  )} '${m.slice(2, 4)}`;

export function fundingTrend(
  rounds: readonly RoundRow[],
  months: number,
  top = 6,
  now = Date.now(),
) {
  const keys = lastMonths(months, now);
  const inWindow = rounds.filter((r) => r.announcedOn >= `${keys[0]}-01`);
  const byCategory = new Map<string, number>();
  for (const r of inWindow) {
    const c = r.project.category ?? 'Other';
    byCategory.set(c, (byCategory.get(c) ?? 0) + (r.amountUsd ?? 0));
  }
  const topCategories = [...byCategory.entries()]
    .filter(([c, v]) => c !== 'Other' && v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([c]) => c);
  const categoryOf = (r: RoundRow) =>
    r.project.category && topCategories.includes(r.project.category) ? r.project.category : 'Other';
  const series = [...topCategories, 'Other'].map((key) => ({
    key,
    label: key,
    values: keys.map((m) =>
      inWindow
        .filter((r) => r.announcedOn.startsWith(m) && categoryOf(r) === key)
        .reduce((s, r) => s + (r.amountUsd ?? 0), 0),
    ),
  }));
  const counts = keys.map((m) => inWindow.filter((r) => r.announcedOn.startsWith(m)).length);
  const totals = keys.map((_, i) => series.reduce((s, x) => s + x.values[i]!, 0));
  return { keys, labels: keys.map(monthLabel), series, counts, totals };
}

export function roundTypeSlices(rounds: readonly RoundRow[]) {
  const counts = new Map<string, number>();
  for (const r of rounds) {
    const t = r.roundType ?? 'Not stated';
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, value]) => ({ label, value }));
}
