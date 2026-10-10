/**
 * Funding-round vocabulary.
 *
 * Sources spell round types every way there is — "seed", "Seed Round",
 * "SEED", "Pre Seed", "series-a". Filters and charts need one spelling, so
 * names are mapped onto a fixed set here. Anything unrecognised is kept as
 * printed rather than forced into a bucket it may not belong in.
 */

export const ROUND_TYPES = [
  'Pre-seed',
  'Seed',
  'Series A',
  'Series B',
  'Series C',
  'Series D+',
  'Strategic',
  'Private',
  'Public sale',
  'Grant',
  'Acquisition',
  'Debt',
] as const;
export type RoundType = (typeof ROUND_TYPES)[number];

const PATTERNS: [RegExp, RoundType][] = [
  [/^pre[\s-]?seed/, 'Pre-seed'],
  [/^seed|^angel/, 'Seed'],
  [/^series[\s-]?a\b/, 'Series A'],
  [/^series[\s-]?b\b/, 'Series B'],
  [/^series[\s-]?c\b/, 'Series C'],
  [/^series[\s-]?[d-z]\b/, 'Series D+'],
  [/^strategic/, 'Strategic'],
  [/^(private|token (?:sale|round)|presale|pre-sale)/, 'Private'],
  [/^(public|ico|ido|ieo|community sale|launchpad|crowd)/, 'Public sale'],
  [/grant/, 'Grant'],
  [/^(m&a|acquisition|acquired)/, 'Acquisition'],
  [/^(debt|loan|credit)/, 'Debt'],
];

/** Round types that say nothing — treated as "not stated". */
const MEANINGLESS =
  /^(undisclosed|unknown|n\/?a|-|funding|funding round|round|other|series unknown)$/;

export function normalizeRoundType(raw: string | null | undefined): string | null {
  const cleaned = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+round$/, '')
    .replace(/\s+/g, ' ');
  if (!cleaned || MEANINGLESS.test(cleaned)) return null;
  for (const [pattern, type] of PATTERNS) if (pattern.test(cleaned)) return type;
  // Unrecognised: keep it, in sentence case.
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Position of a round type in a company's life, for ordering; unknown types sort last. */
export function roundStage(type: string | null): number {
  const i = ROUND_TYPES.indexOf(type as RoundType);
  return i === -1 ? ROUND_TYPES.length : i;
}

/** Disclosed-size buckets for filters. */
export const ROUND_SIZES = [
  { key: 'lt1m', label: 'Under $1M', min: 0, max: 1e6 },
  { key: '1-5m', label: '$1M – $5M', min: 1e6, max: 5e6 },
  { key: '5-20m', label: '$5M – $20M', min: 5e6, max: 20e6 },
  { key: '20-100m', label: '$20M – $100M', min: 20e6, max: 100e6 },
  { key: 'gte100m', label: '$100M and over', min: 100e6, max: Infinity },
] as const;
