/**
 * Which records a news item mentions.
 *
 * Matching is by name, on word boundaries, and only ever *suggests* a link:
 * every automatic mention is stored as unreviewed and labelled as matched by
 * name. Names that are ordinary words ("Drift", "Orca", "Step") would match
 * half the internet, so they only count when the item is about Solana and
 * the name is written as a name — capitalised.
 */

export interface MentionCandidate {
  readonly id: number;
  /** The record's name and any aliases. */
  readonly names: readonly string[];
}

export interface Mention {
  readonly id: number;
  readonly matchedBy: 'title' | 'summary';
}

/** Lower-case names that are also common English words. */
const COMMON_WORDS = new Set([
  'drift',
  'orca',
  'step',
  'port',
  'atlas',
  'oxygen',
  'mango',
  'hubble',
  'parcl',
  'zeta',
  'phoenix',
  'tensor',
  'helium',
  'render',
  'sanctum',
  'access',
  'friktion',
  'genesis',
  'saber',
  'synthetify',
  'lifinity',
  'mercurial',
  'invariant',
  'goosefx',
  'switchboard',
  'squads',
  'backpack',
  'magic',
  'flash',
  'vault',
  'stake',
  'swap',
  'bonk',
  'jupiter',
  'raydium',
  'kamino',
  'marginfi',
  'meteora',
  'solend',
  'save',
  'pump',
  'moonshot',
  'gauntlet',
  'glow',
  'cypher',
  'francium',
  'tulip',
  'apricot',
  'larix',
  'jet',
  'marinade',
  'blaze',
  'jito',
  'lido',
  'pyth',
  'wormhole',
  'portal',
  'allbridge',
  'mayan',
  'debridge',
  'fluxbeam',
  'openbook',
  'serum',
  'aldrin',
  'crema',
  'cropper',
  'dexlab',
  'saros',
  'stepn',
  'grass',
  'nosana',
  'shadow',
  'hivemapper',
  'teleport',
]);

const ALWAYS_SKIP = new Set(['solana', 'the', 'and', 'app', 'finance', 'protocol', 'labs', 'dao']);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile(name: string): { re: RegExp; strict: boolean } | null {
  const trimmed = name.trim();
  if (trimmed.length < 3 || ALWAYS_SKIP.has(trimmed.toLowerCase())) return null;
  const strict = COMMON_WORDS.has(trimmed.toLowerCase());
  // Boundaries that also hold next to punctuation: "Jupiter's", "(Kamino)".
  const body = escape(trimmed).replace(/\\ /g, '\\s+');
  return {
    re: new RegExp(`(?:^|[^\\p{L}\\p{N}])${body}(?=$|[^\\p{L}\\p{N}])`, strict ? 'u' : 'iu'),
    strict,
  };
}

export function findMentions(
  item: { title: string; summary?: string | null },
  candidates: readonly MentionCandidate[],
): Mention[] {
  const title = item.title ?? '';
  const summary = item.summary ?? '';
  const aboutSolana = /\bsolana\b|\bSOL\b/i.test(`${title} ${summary}`);
  const out: Mention[] = [];
  for (const c of candidates) {
    let found: Mention['matchedBy'] | null = null;
    for (const name of c.names) {
      const compiled = compile(name);
      if (!compiled) continue;
      // An ordinary word only counts in a story about Solana, written as a name.
      if (compiled.strict && (!aboutSolana || !/^[A-Z0-9]/.test(name.trim()))) continue;
      if (compiled.re.test(title)) {
        found = 'title';
        break;
      }
      if (!found && summary && compiled.re.test(summary)) found = 'summary';
    }
    if (found) out.push({ id: c.id, matchedBy: found });
  }
  return out;
}
