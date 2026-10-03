'use client';

import { formatPrice } from '@marketroom/core';
import { useEffect, useRef, useState } from 'react';

/**
 * A price that shows when it moves.
 *
 * The index streams live mids over a websocket, and until now the numbers
 * changed silently — a table that is updating and a table that is frozen
 * looked identical. A brief tint on the cell is the smallest thing that makes
 * "this is live" legible without turning the page into a light show.
 *
 * Three constraints shaped it:
 *
 *  - **It only fires after mount.** The first render must match the server's,
 *    so the initial price never flashes.
 *  - **It is keyed on the direction of the change**, not the sign of the
 *    price, so a fall tints down even while the day is up.
 *  - **It respects `prefers-reduced-motion`.** The global rule in tokens.css
 *    collapses the animation to nothing, so the number still updates — it
 *    simply does not pulse.
 */
export function TickingPrice({ value }: { value: number | null }) {
  const previous = useRef<number | null>(null);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = value;

    // Nothing to compare against on the first pass — that is the server's
    // value, and flashing it would claim a movement that did not happen.
    if (before === null || value === null || before === value) return;

    setFlash(value > before ? 'up' : 'down');
    const id = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(id);
  }, [value]);

  return <span className={flash ? `mr-flash-${flash}` : undefined}>{formatPrice(value)}</span>;
}
