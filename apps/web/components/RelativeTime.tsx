'use client';

import { formatRelativeTime } from '@marketroom/core';
import { useEffect, useState } from 'react';

/**
 * A timestamp rendered as "3s ago", without breaking hydration.
 *
 * `formatRelativeTime` reads the clock, so a server render of "4s ago" and a
 * client hydration a moment later produce different text and React throws a
 * hydration mismatch. It only fires when the two land either side of a
 * boundary, which makes it intermittent — the worst kind, because it passes
 * most of the time and fails in front of someone else.
 *
 * So the first client render deliberately matches the server exactly, and the
 * live value is swapped in afterwards. It then refreshes on its own, which the
 * static version never did: a panel claiming "5s ago" ten minutes later is
 * worse than no timestamp at all.
 */
export function RelativeTime({
  epochMs,
  /** How often to re-render. Freshness cues do not need to tick every second. */
  intervalMs = 15_000,
}: {
  epochMs: number;
  intervalMs?: number;
}) {
  // Seeded from the server-supplied timestamp so SSR and first paint agree.
  const [now, setNow] = useState(epochMs);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return (
    <time
      dateTime={new Date(epochMs).toISOString()}
      // The server and the first client render both produce "just now" from the
      // seeded value; `suppressHydrationWarning` covers the edge where the
      // server's own clock advanced mid-render.
      suppressHydrationWarning
    >
      {mounted ? formatRelativeTime(epochMs, now) : formatRelativeTime(epochMs, epochMs)}
    </time>
  );
}
