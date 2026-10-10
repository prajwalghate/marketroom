import type { Db } from '../client';

/** What every import job is handed. */
export interface JobContext {
  readonly db: Db;
  readonly now: Date;
  /** Who the change log and evidence name: `import:<job>`. */
  readonly actor: string;
  /**
   * True on a job's first successful run. A first run fills an empty
   * database; logging each of its rows as an "update" would bury every real
   * update after it, so first runs write no change log.
   */
  readonly bootstrap: boolean;
  readonly signal?: AbortSignal;
  readonly env: JobEnv;
  readonly log: (message: string) => void;
}

export interface JobEnv {
  readonly defillamaKey?: string | null;
  readonly coingeckoKey?: string | null;
  readonly githubToken?: string | null;
  readonly rpcUrl?: string | null;
}

export interface JobResult {
  readonly stats: Record<string, number>;
  /** Some items failed but the job as a whole made progress. */
  readonly partial?: boolean;
}

/** First sentence of a description, for a one-line tagline. */
export function firstSentence(text: string | null | undefined, max = 160): string | null {
  const clean = text?.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const sentence = clean.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? clean;
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[,;:\s]+$/, '')}…`;
}

export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
