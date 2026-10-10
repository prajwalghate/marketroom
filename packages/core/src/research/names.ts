/**
 * Names, as the research database compares them.
 *
 * Two jobs with different appetites for risk:
 *
 *  - `normalizeName` decides identity during import. It is conservative —
 *    case, accents, punctuation and legal suffixes only — because a false
 *    match silently merges two real organisations ("Jump Capital" and "Jump
 *    Crypto" are different firms).
 *  - `looseKey` only *suggests* duplicates to an editor, so it is greedy:
 *    it also drops the generic words investors put after their names.
 */

const LEGAL_SUFFIXES = new Set([
  'inc',
  'incorporated',
  'llc',
  'ltd',
  'limited',
  'gmbh',
  'ag',
  'sa',
  'bv',
  'plc',
  'corp',
  'corporation',
  'co',
  'lp',
  'llp',
  'pte',
]);

/** Words that describe what an organisation is rather than which one it is. */
const ORG_WORDS = new Set([
  'capital',
  'ventures',
  'venture',
  'partners',
  'partner',
  'labs',
  'lab',
  'fund',
  'funds',
  'group',
  'holdings',
  'investments',
  'investment',
  'management',
  'asset',
  'assets',
  'vc',
  'dao',
  'foundation',
  'protocol',
  'network',
  'finance',
  'financial',
  'digital',
  'global',
  'crypto',
  'research',
  'studio',
  'studios',
  'technologies',
  'technology',
  'advisors',
  'advisory',
  'equity',
  'exchange',
  'securities',
  'trading',
  'markets',
  'accelerator',
  'incubator',
  'collective',
  'syndicate',
  'the',
]);

export function normalizeName(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`".,()]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1]!)) words.pop();
  return words.join(' ');
}

/** For duplicate suggestions only — never for deciding identity. */
export function looseKey(name: string): string {
  const words = normalizeName(name).split(' ');
  const kept = words.filter((w) => !ORG_WORDS.has(w));
  return (kept.length ? kept : words).join(' ');
}

/** A URL-safe slug. */
export function toSlug(input: string): string {
  return (
    input
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/['’`]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'item'
  );
}

/** `base`, else `base-2`, `base-3`… — whichever is free. */
export function uniqueSlug(base: string, taken: (slug: string) => boolean): string {
  const root = toSlug(base);
  if (!taken(root)) return root;
  for (let n = 2; n < 10_000; n += 1) {
    const candidate = `${root}-${n}`;
    if (!taken(candidate)) return candidate;
  }
  throw new Error(`No free slug for ${base}`);
}

/**
 * Whether an investor name, as a funding announcement printed it, reads as a
 * person or an organisation.
 *
 * Announcements list angels by personal name next to firms ("Multicoin
 * Capital, Anatoly Yakovenko"). Nothing in the data says which is which, so
 * this is a guess — callers must record it as one and route it to review.
 */
export type PartyGuess = 'person' | 'organization';

/** Words that never appear in a personal name, on top of `ORG_WORDS`. */
const NOT_PERSONAL = new Set([
  ...ORG_WORDS,
  'investors',
  'coinvestors',
  'angels',
  'brands',
  'media',
  'games',
  'gaming',
  'bank',
  'company',
  'street',
  'trust',
  'family',
  'office',
  'alpha',
  'chain',
  'blockchain',
  'coin',
  'token',
  'web3',
  'defi',
  'nft',
  'solana',
  'ecosystem',
  'ai',
  'hub',
  'dex',
  // Seen as firm names in Solana funding announcements.
  'associates',
  'next',
  'invest',
  'investing',
  'wealth',
  'club',
  'consortium',
  'industries',
  'industry',
  'cartel',
  'effects',
  'prime',
  'peak',
  'project',
  'projects',
  'asia',
  'europe',
  'africa',
  'america',
  'americas',
  'latam',
  'japan',
  'korea',
  'china',
  'singapore',
  'dubai',
  'tree',
  'chapter',
  'dragon',
  'captial',
  'quant',
  'systems',
  'solutions',
  'enterprises',
  'innovation',
  'innovations',
  'opportunities',
  'alliance',
  'association',
  'institute',
  'university',
  'society',
  'council',
  'house',
  'works',
  'factory',
  'garage',
  'node',
  'nodes',
  'validators',
  'mining',
  'pool',
  'pay',
  'payments',
  'banking',
  'tech',
  'software',
  'cloud',
  'data',
  'networks',
  'world',
  'international',
  'worldwide',
  'team',
  'guild',
  // Function words never appear in a personal name ("Not Boring", "House of …").
  'not',
  'of',
  'for',
  'by',
]);

/**
 * Firms whose names read exactly like a person's. Short on purpose: it only
 * needs the ones that actually turn up in Solana funding announcements.
 */
const FIRMS_NAMED_LIKE_PEOPLE = new Set([
  'andreessen horowitz',
  'goldman sachs',
  'morgan stanley',
  'franklin templeton',
  'brevan howard',
  'jane street',
  'charles schwab',
]);

export function guessParty(name: string): PartyGuess {
  const trimmed = name.trim();
  if (!trimmed) return 'organization';
  // Digits, symbols, domains and handles are never personal names.
  if (/[0-9@/.:+]/.test(trimmed) || /\b(x|io|xyz|fi|gg)$/i.test(trimmed)) return 'organization';
  if (FIRMS_NAMED_LIKE_PEOPLE.has(normalizeName(trimmed))) return 'organization';
  const words = trimmed.split(/\s+/);
  if (words.length < 2 || words.length > 4) return 'organization';
  if (words.some((w) => NOT_PERSONAL.has(w.toLowerCase()) || LEGAL_SUFFIXES.has(w.toLowerCase())))
    return 'organization';
  // Each word a capitalised name: "Anatoly", "O'Neil", "Jean-Luc"; allow "de", "van".
  const particle = /^(de|da|del|van|von|der|di|la|le|bin)$/;
  const nameWord = /^[A-Z][a-z]+(?:[-'’][A-Z]?[a-z]+)*\.?$/;
  return words.every((w) => particle.test(w) || nameWord.test(w)) ? 'person' : 'organization';
}
