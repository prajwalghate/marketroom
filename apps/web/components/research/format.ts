/**
 * Date and time wording for the research pages. Always UTC, so a server
 * render and a reader in another timezone agree on what a date is.
 */

const day = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const month = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const stamp = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  hour12: false,
});

/** "3 Oct 2026" from an ISO date or epoch ms. */
export function fmtDay(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const ms =
    typeof value === 'number'
      ? value
      : Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isFinite(ms) ? day.format(ms) : '—';
}

export function fmtMonth(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const ms =
    typeof value === 'number'
      ? value
      : Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isFinite(ms) ? month.format(ms) : '—';
}

/** "3 Oct 2026, 14:02 UTC". */
export function fmtStamp(ms: number | null | undefined): string {
  return ms === null || ms === undefined ? '—' : `${stamp.format(ms)} UTC`;
}

/** "4 min ago", "3 days ago" — for freshness, next to an exact timestamp. */
export function ago(ms: number | null | undefined, now = Date.now()): string {
  if (ms === null || ms === undefined) return 'never';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 60) return `${d} days ago`;
  const mo = Math.round(d / 30);
  return mo < 24 ? `${mo} months ago` : `${Math.round(mo / 12)} years ago`;
}

export const isoOf = (ms: number) => new Date(ms).toISOString();

/** "≈ 6,120 / hour" with sensible rounding for rates that are estimates. */
export function fmtRate(perHour: number | null | undefined): string {
  if (perHour === null || perHour === undefined || !Number.isFinite(perHour)) return '—';
  if (perHour === 0) return '0 / hour';
  if (perHour < 1) return `≈ ${(perHour * 24).toFixed(perHour * 24 < 10 ? 1 : 0)} / day`;
  const rounded =
    perHour >= 1000
      ? Math.round(perHour / 100) * 100
      : perHour >= 100
        ? Math.round(perHour / 10) * 10
        : Math.round(perHour);
  return `≈ ${rounded.toLocaleString('en-US')} / hour`;
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 90) return `${Math.round(seconds)} s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  if (seconds < 172_800) return `${(seconds / 3600).toFixed(1)} h`;
  return `${Math.round(seconds / 86_400)} days`;
}

export const shortAddress = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export const hostname = (url: string | null | undefined) => {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export const twitterUrl = (handle: string) =>
  /^https?:\/\//.test(handle) ? handle : `https://x.com/${handle.replace(/^@/, '')}`;
