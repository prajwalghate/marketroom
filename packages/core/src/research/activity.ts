/**
 * Program activity, estimated from transaction signatures.
 *
 * A Solana RPC node returns a program's most recent signatures, newest first,
 * with block times. That is enough to say how busy the program has been
 * lately — and nothing more. It is a sample, not a count: a burst of
 * transactions just before the sample was taken reads as a busy program. So
 * every figure produced here is an estimate, and the method travels with it.
 */

export interface SignatureSample {
  /** Unix seconds, or null when the node did not report one. */
  readonly blockTime: number | null;
  readonly failed: boolean;
}

export interface ActivityEstimate {
  readonly sampleSize: number;
  /**
   * Seconds from the oldest signature in the sample to `now` — or from
   * `completeSince`, when the sample is known to be complete from there.
   */
  readonly windowSeconds: number | null;
  readonly txPerHour: number | null;
  /** Share of sampled transactions that failed, 0–1. */
  readonly failedShare: number | null;
  readonly latestTxAt: number | null;
}

export interface ActivityOptions {
  /**
   * Unix ms from which the sample is known to hold *every* signature: the node
   * returned fewer than were asked for, so it has none older that it left
   * out, and its history starts here.
   *
   * Without it, a sample is assumed to be the newest slice of a longer
   * history, and the window starts at its oldest signature. With it, the
   * window starts here instead — a program with three transactions in a day
   * of history is not busy because two of them were an hour ago — and an
   * empty sample is a measured zero rather than nothing.
   */
  readonly completeSince?: number | null;
}

/**
 * Transactions per hour over the window from the oldest sampled signature to
 * now. Measuring to *now* rather than to the newest signature is what keeps a
 * program that went quiet a week ago from reading as busy.
 */
export function estimateActivity(
  samples: readonly SignatureSample[],
  nowMs: number,
  options: ActivityOptions = {},
): ActivityEstimate {
  const times = samples
    .map((s) => s.blockTime)
    .filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
  const sampleSize = samples.length;
  const failedShare = sampleSize ? samples.filter((s) => s.failed).length / sampleSize : null;
  const since =
    typeof options.completeSince === 'number' && Number.isFinite(options.completeSince)
      ? options.completeSince / 1000
      : null;
  const latestTxAt = times.length ? Math.max(...times) * 1000 : null;

  if (since !== null) {
    // Every transaction since `since` is in the sample, so all of them count —
    // even one the node could not date. A node that pruned past one of its
    // own signatures between calls cannot make the window start after it.
    const start = times.length ? Math.min(since, ...times) : since;
    const windowSeconds = Math.max(1, nowMs / 1000 - start);
    return {
      sampleSize,
      windowSeconds,
      txPerHour: (sampleSize / windowSeconds) * 3600,
      failedShare,
      latestTxAt,
    };
  }

  if (times.length === 0) {
    return { sampleSize, windowSeconds: null, txPerHour: null, failedShare, latestTxAt: null };
  }
  const oldest = Math.min(...times);
  const windowSeconds = Math.max(1, nowMs / 1000 - oldest);
  return {
    sampleSize,
    windowSeconds,
    txPerHour: (times.length / windowSeconds) * 3600,
    failedShare,
    latestTxAt,
  };
}

export type ActivityLevel = 'high' | 'moderate' | 'low' | 'dormant' | 'unknown';

export const ACTIVITY_LEVELS: { key: ActivityLevel; label: string }[] = [
  { key: 'high', label: 'High' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'low', label: 'Low' },
  { key: 'dormant', label: 'Dormant' },
  { key: 'unknown', label: 'Not measured' },
];

const DAY_MS = 86_400_000;

/** A coarse level for filtering. Thresholds are per hour, across a project's programs. */
export function activityLevel(
  txPerHour: number | null,
  latestTxAt: number | null,
  nowMs: number,
): ActivityLevel {
  if (txPerHour === null && latestTxAt === null) return 'unknown';
  if (latestTxAt !== null && nowMs - latestTxAt > 30 * DAY_MS) return 'dormant';
  if (txPerHour === null) return 'unknown';
  if (txPerHour >= 1_000) return 'high';
  if (txPerHour >= 30) return 'moderate';
  return 'low';
}
