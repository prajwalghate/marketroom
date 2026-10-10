/**
 * Display formatting.
 *
 * Centralised so that a price renders identically everywhere, and so that
 * "missing" always renders as an em dash rather than `0`, `NaN` or `undefined`
 * leaking into the UI.
 */

/** What a missing value looks like. One constant, used everywhere. */
export const EMPTY = '—';

const isMissing = (value: number | null | undefined): value is null | undefined =>
  value === null || value === undefined || !Number.isFinite(value);

/**
 * Compact USD, for volume / OI / liquidity. `$1.2B`, `$340.5M`, `$12.4K`.
 */
export function formatCompactUsd(value: number | null | undefined, dp = 1): string {
  if (isMissing(value)) return EMPTY;
  // A reported zero is "$0" — "$0.00" reads as a measurement precise to the cent.
  if (value === 0) return '$0';

  const sign = value < 0 ? '-' : '';
  const magnitude = Math.abs(value);

  if (magnitude >= 1e12) return `${sign}$${(magnitude / 1e12).toFixed(dp)}T`;
  if (magnitude >= 1e9) return `${sign}$${(magnitude / 1e9).toFixed(dp)}B`;
  if (magnitude >= 1e6) return `${sign}$${(magnitude / 1e6).toFixed(dp)}M`;
  if (magnitude >= 1e3) return `${sign}$${(magnitude / 1e3).toFixed(dp)}K`;
  return `${sign}$${magnitude.toFixed(dp === 0 ? 0 : 2)}`;
}

/**
 * Price in USD, with precision scaled to magnitude — a $0.42 token needs more
 * decimals than a $30,000 index.
 */
export function formatPrice(value: number | null | undefined): string {
  if (isMissing(value)) return EMPTY;

  const magnitude = Math.abs(value);
  const decimals = magnitude >= 1000 ? 2 : magnitude >= 1 ? 2 : magnitude >= 0.01 ? 4 : 6;

  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Signed percentage from a fraction. `0.0213` → `+2.13%`.
 *
 * The explicit sign is not decoration: it is what makes direction legible
 * without relying on colour alone, which matters for red/green colour blindness.
 */
export function formatPercent(fraction: number | null | undefined, dp = 2): string {
  if (isMissing(fraction)) return EMPTY;
  const percent = fraction * 100;
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent.toFixed(dp)}%`;
}

/** Unsigned percentage, for spreads and shares where a sign would be noise. */
export function formatPercentAbs(fraction: number | null | undefined, dp = 2): string {
  if (isMissing(fraction)) return EMPTY;
  return `${Math.abs(fraction * 100).toFixed(dp)}%`;
}

/** Basis points, for tight spreads where percent loses resolution. */
export function formatBps(fraction: number | null | undefined, dp = 1): string {
  if (isMissing(fraction)) return EMPTY;
  return `${(fraction * 10_000).toFixed(dp)} bps`;
}

/** Funding rate, which is small enough that percent needs more decimals. */
export function formatFunding(fraction: number | null | undefined): string {
  if (isMissing(fraction)) return EMPTY;
  const sign = fraction > 0 ? '+' : '';
  return `${sign}${(fraction * 100).toFixed(4)}%`;
}

/** Plain integer with thousands separators. */
export function formatCount(value: number | null | undefined): string {
  if (isMissing(value)) return EMPTY;
  return Math.round(value).toLocaleString('en-US');
}

/**
 * P/E. `null` is a real answer for private or loss-making companies, and we
 * render it as such rather than inventing a figure.
 */
export function formatPeRatio(value: number | null | undefined): string {
  if (isMissing(value)) return 'N/A';
  return `~${value.toFixed(0)}`;
}

/** Leverage. `1` means spot, which has no leverage to speak of. */
export function formatLeverage(value: number | null | undefined): string {
  if (isMissing(value) || value <= 1) return EMPTY;
  return `${value}×`;
}

/** Short relative time for freshness indicators. */
export function formatRelativeTime(epochMs: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - epochMs) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Country code → flag emoji. Handles duals like `US/AU`. */
export function countryFlag(code: string | null): string {
  if (!code) return '';
  return code
    .split('/')
    .map((part) => {
      const trimmed = part.trim().toUpperCase();
      if (trimmed.length !== 2) return '';
      return String.fromCodePoint(
        ...[...trimmed].map((char) => 0x1f1e6 + (char.charCodeAt(0) - 65)),
      );
    })
    .filter(Boolean)
    .join(' ');
}

/**
 * A percentage whose precision follows its size.
 *
 * Fill deviations span five orders of magnitude on the same page — 0.04% on
 * NVDA, 3,016% on a dead pool — and one fixed precision renders one end of
 * that range as noise and the other as `0.00%`.
 */
export function formatPercentAdaptive(
  fraction: number | null | undefined,
  { signed = false }: { signed?: boolean } = {},
): string {
  if (isMissing(fraction)) return EMPTY;
  const percent = fraction * 100;
  const magnitude = Math.abs(percent);
  // A measured, non-zero cost must never print as 0.00% — that reads as free.
  if (magnitude > 0 && magnitude < 0.005) return `${signed ? (percent > 0 ? '+' : '−') : ''}<0.01%`;
  const dp = magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2;
  const body = magnitude.toLocaleString('en-US', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
  const sign = !signed || percent === 0 ? '' : percent > 0 ? '+' : '−';
  return `${sign}${body}%`;
}

/** An order size in words: `$10,000`. Sentences read sizes; they do not decode `$10k`. */
export function formatNotional(usd: number): string {
  return `$${Math.round(usd).toLocaleString('en-US')}`;
}

/** An order size for a tight label: `$10k`, `$100`, `$1.5M`. */
export function formatNotionalShort(usd: number): string {
  if (usd >= 1e6) return `$${trimZero((usd / 1e6).toFixed(1))}M`;
  if (usd >= 1e3) return `$${trimZero((usd / 1e3).toFixed(1))}k`;
  return `$${Math.round(usd)}`;
}

const trimZero = (value: string) => value.replace(/\.0$/, '');

/**
 * A threshold, as a round number: `1%`, `0.5%`, `2%`. Cut-offs are chosen to be
 * round, and printing one as `1.00%` makes it read like a measurement.
 */
export function formatThreshold(fraction: number): string {
  return `${Number((fraction * 100).toFixed(2))}%`;
}
