'use client';

import { useEffect, useState } from 'react';

/**
 * Pauses and resumes the moving price strip. Moving content needs a way to
 * stop it that does not depend on a mouse; the choice is remembered, and is
 * applied before first paint by the inline script in `layout.tsx`.
 */
export function TickerToggle() {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setPaused(document.documentElement.getAttribute('data-ticker') === 'paused');
  }, []);

  const toggle = () => {
    const next = !paused;
    setPaused(next);
    if (next) document.documentElement.setAttribute('data-ticker', 'paused');
    else document.documentElement.removeAttribute('data-ticker');
    try {
      localStorage.setItem('mr-ticker', next ? 'paused' : 'moving');
    } catch {
      // Storage can be blocked; the toggle still works for this page.
    }
  };

  return (
    <button
      type="button"
      className="rx-ticker-toggle"
      onClick={toggle}
      /* The label states the action, as the theme toggle's does. */
      aria-label={paused ? 'Start the price ticker' : 'Pause the price ticker'}
      title={paused ? 'Start the price ticker' : 'Pause the price ticker'}
    >
      <span aria-hidden="true">{paused ? '▶' : '❚❚'}</span>
    </button>
  );
}
