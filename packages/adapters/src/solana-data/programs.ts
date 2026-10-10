/**
 * Solana programs: which ones are verified builds, and which are swap venues.
 *
 * OtterSec's verification registry, verified 2026-10-10: one request to
 * `GET https://verify.osec.io/verified-programs-status` (~240 KB, ~7 s)
 * returns every program whose deployed bytecode OtterSec has rebuilt from
 * public source — 492 of them, each with its repository and commit. 483 of
 * the repositories are on GitHub; 33 rows name no commit. Each program has a
 * public status page, which is what evidence cites.
 *
 * Jupiter's label map (`GET https://lite-api.jup.ag/swap/v1/program-id-to-label`)
 * names the ~100 programs Jupiter routes swaps through: "Raydium CLMM",
 * "Meteora DLMM", "Whirlpool". A label names a product line, not a team, so
 * matching one to a project is a guess and is recorded as one.
 */

import { looseKey, normalizeName } from '@marketroom/core';
import { fetchJson } from '../http';
import { isAddress, USER_AGENT } from './rpc';

export const OTTERSEC_REGISTRY = 'https://verify.osec.io/verified-programs-status';
export const JUPITER_LABELS = 'https://lite-api.jup.ag/swap/v1/program-id-to-label';

/** The page a reader can open to check one program's verification. */
export const otterSecStatusPage = (address: string) =>
  `https://verify.osec.io/status/${encodeURIComponent(address)}`;

// ---------------------------------------------------------------------------
// Repositories
// ---------------------------------------------------------------------------

export interface RepoRef {
  /** `github.com`, `gitlab.com`, or a self-hosted forge. */
  readonly host: string;
  /** The account or organisation that owns the repository. */
  readonly owner: string;
  readonly name: string;
  /** The repository itself, without a commit or branch: `https://github.com/{owner}/{name}`. */
  readonly url: string;
  /** The commit, tag or branch the link pointed at, if any. */
  readonly ref: string | null;
}

/**
 * A repository link, split into what it names. Accepts GitHub's
 * `/{owner}/{repo}/tree/{ref}`, GitLab's `/-/tree/{ref}` (with nested
 * groups), a trailing `.git` or slash, and self-hosted forges.
 */
export function parseRepoUrl(url: string | null | undefined): RepoRef | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const decode = (segment: string) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  };
  const parts = parsed.pathname.split('/').filter(Boolean).map(decode);
  let end = parts.length;
  let ref: string | null = null;
  // A repository needs an owner and a name, so `tree` only counts from the third segment.
  const tree = parts.findIndex((p, i) => p === 'tree' && i >= 2);
  if (tree >= 0) {
    end = parts[tree - 1] === '-' ? tree - 1 : tree;
    ref = parts[tree + 1] ?? null;
  }
  const path = parts.slice(0, end);
  if (path.length < 2) return null;
  const name = path[path.length - 1]!.replace(/\.git$/i, '');
  if (!name) return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  return {
    host,
    owner: path[0]!,
    name,
    url: `https://${host}/${[...path.slice(0, -1), name].map(encodeURIComponent).join('/')}`,
    ref,
  };
}

const ACRONYMS = new Set([
  'amm',
  'clmm',
  'dlmm',
  'cpmm',
  'dex',
  'nft',
  'spl',
  'lst',
  'sdk',
  'api',
  'rwa',
  'oft',
  'ntt',
  'ccip',
  'dao',
  'evm',
  'zk',
]);

/** "protocol-v2" → "Protocol V2", "clmm_program" → "CLMM Program": a name for a program nobody has named. */
export function prettyRepoName(name: string): string {
  return name
    .replace(/\.git$/i, '')
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower) || /^v\d+$/.test(lower)) return lower.toUpperCase();
      return word[0]!.toUpperCase() + word.slice(1);
    })
    .join(' ');
}

// ---------------------------------------------------------------------------
// OtterSec
// ---------------------------------------------------------------------------

export interface VerifiedProgram {
  readonly address: string;
  /** Where the source lives, split up; `null` when the link is not a recognisable repository. */
  readonly repo: RepoRef | null;
  /** The repository's root link — or, when it could not be split up, the link as OtterSec gave it. */
  readonly repoUrl: string | null;
  /** The commit (or tag) OtterSec built from, as it reported it. */
  readonly commit: string | null;
  /** Unix ms of OtterSec's last check. */
  readonly verifiedAt: number | null;
}

interface WireVerified {
  program_id?: string | null;
  is_verified?: boolean | null;
  last_verified_at?: string | null;
  repo_url?: string | null;
  commit?: string | null;
}

/** OtterSec writes UTC timestamps with no zone; read naively, they would be local time. */
export function parseUtc(value: string | null | undefined): number | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const zoned = /(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed) ? trimmed : `${trimmed}Z`;
  const ms = Date.parse(zoned);
  return Number.isFinite(ms) ? ms : null;
}

export function parseVerifiedPrograms(payload: unknown): VerifiedProgram[] {
  const rows = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(rows)) throw new Error('OtterSec: unexpected response shape');
  const out = new Map<string, VerifiedProgram>();
  for (const row of rows as (WireVerified | null)[]) {
    if (!row || row.is_verified !== true) continue;
    const address = row.program_id?.trim();
    if (!address || !isAddress(address)) continue;
    const repo = parseRepoUrl(row.repo_url);
    const raw = row.repo_url?.trim() ?? '';
    out.set(address, {
      address,
      repo,
      repoUrl: repo?.url ?? (/^https?:\/\/\S+$/i.test(raw) ? raw : null),
      commit: row.commit?.trim() || repo?.ref || null,
      verifiedAt: parseUtc(row.last_verified_at),
    });
  }
  return [...out.values()];
}

// ---------------------------------------------------------------------------
// Jupiter
// ---------------------------------------------------------------------------

export interface SwapLabel {
  readonly address: string;
  readonly label: string;
}

export function parseSwapLabels(payload: unknown): SwapLabel[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Jupiter labels: unexpected response shape');
  }
  const out: SwapLabel[] = [];
  for (const [address, label] of Object.entries(payload as Record<string, unknown>)) {
    if (typeof label !== 'string' || !label.trim() || !isAddress(address)) continue;
    out.push({ address, label: label.trim() });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Label → project
// ---------------------------------------------------------------------------

/**
 * Words that name a product line or a version rather than a team: "Raydium
 * CLMM" and "Raydium CP" are both Raydium's. A label carries them at its end,
 * which prefix matching already looks past; a project's name sometimes does
 * too ("Orca DEX"), so its shortened form is indexed without them.
 */
const PRODUCT_WORDS = new Set([
  'clmm',
  'dlmm',
  'cpmm',
  'cp',
  'amm',
  'damm',
  'vmm',
  'stable',
  'stableswap',
  'swap',
  'swaps',
  'pool',
  'pools',
  'dex',
  'lend',
  'earn',
  'rfq',
  'launchlab',
  'legacy',
]);

/** A name as comparable words: lower case, no accents or punctuation; dots and brackets split words. */
const comparable = (text: string) => normalizeName(text.replace(/[._/()[\]-]+/g, ' '));

/** `comparable`, less trailing product words and versions: "Raydium CLMM" → "raydium". */
export function labelKey(text: string): string {
  const words = comparable(text).split(' ').filter(Boolean);
  while (words.length && (PRODUCT_WORDS.has(words.at(-1)!) || /^v\d+$/.test(words.at(-1)!))) {
    words.pop();
  }
  return words.join(' ');
}

export interface NamedRecord {
  readonly id: number;
  /** The record's name and its aliases. */
  readonly names: readonly string[];
}

/** Project names in comparable form, to the projects that answer to them. */
export interface LabelIndex {
  /** Names as written. */
  readonly exact: ReadonlyMap<string, ReadonlySet<number>>;
  /**
   * Shortened forms — without trailing product words ("Orca DEX" → "orca")
   * or the words that only say what kind of organisation it is ("Crema
   * Finance" → "crema"). Consulted only where no name matches as written, so
   * "Jupiter Lend" shortened to "jupiter" never competes with "Jupiter".
   */
  readonly loose: ReadonlyMap<string, ReadonlySet<number>>;
}

export function buildLabelIndex(records: readonly NamedRecord[]): LabelIndex {
  const exact = new Map<string, Set<number>>();
  const loose = new Map<string, Set<number>>();
  const add = (index: Map<string, Set<number>>, key: string, id: number) => {
    if (key.length < 3) return;
    const ids = index.get(key) ?? new Set<number>();
    ids.add(id);
    index.set(key, ids);
  };
  for (const record of records) {
    for (const name of record.names) {
      const key = comparable(name);
      add(exact, key, record.id);
      for (const short of new Set([labelKey(name), labelKey(looseKey(name))])) {
        if (short !== key) add(loose, short, record.id);
      }
    }
  }
  return { exact, loose };
}

export interface LabelMatch {
  readonly id: number;
  /** The form of the project's name that matched, for the record of why. */
  readonly matched: string;
}

/**
 * The project a swap label belongs to: the longest project name the label
 * starts with, on word boundaries — "Raydium CLMM" → Raydium, "Saber
 * (Decimals)" → Saber, "Pump.fun Amm" → Pump, "Orca V2" → Orca DEX. At each
 * length a name as written beats a shortened one. A name two projects share
 * matches neither: a guess between two teams is not worth making.
 */
export function matchLabel(label: string, index: LabelIndex): LabelMatch | null {
  const words = comparable(label).split(' ').filter(Boolean);
  for (let n = words.length; n >= 1; n -= 1) {
    const prefix = words.slice(0, n).join(' ');
    for (const tier of [index.exact, index.loose]) {
      const ids = tier.get(prefix);
      if (!ids) continue;
      if (ids.size !== 1) return null;
      return { id: [...ids][0]!, matched: prefix };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class ProgramRegistry {
  constructor(private readonly options: { signal?: AbortSignal } = {}) {}

  /** Every program OtterSec currently lists as a verified build. */
  async verified(): Promise<VerifiedProgram[]> {
    const response = await fetchJson<unknown>(OTTERSEC_REGISTRY, {
      headers: { 'User-Agent': USER_AGENT },
      signal: this.options.signal,
      timeoutMs: 60_000,
      retries: 1,
    });
    return parseVerifiedPrograms(response.data);
  }

  /** Every program Jupiter routes swaps through, with Jupiter's name for it. */
  async swapLabels(): Promise<SwapLabel[]> {
    const response = await fetchJson<unknown>(JUPITER_LABELS, {
      headers: { 'User-Agent': USER_AGENT },
      signal: this.options.signal,
      timeoutMs: 20_000,
    });
    return parseSwapLabels(response.data);
  }
}
