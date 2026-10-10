'use client';

import { useEffect, useRef } from 'react';

/** Scrolls the timeline it sits in to its far end once, so it opens on the latest stop. */
export function ScrollEnd() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current?.closest<HTMLElement>('.rx-htl-wrap');
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth;
  }, []);
  return <span ref={ref} hidden />;
}
