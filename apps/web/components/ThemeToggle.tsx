'use client';

import { useEffect, useState } from 'react';

/**
 * Light/dark toggle.
 *
 * The initial theme is applied by an inline script in `layout.tsx` before
 * first paint — the reader's saved choice, or else the operating system's —
 * so this component only has to stay in sync afterwards and never causes a
 * flash of the wrong theme. Until the reader picks one, the page follows the
 * system as it changes.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const root = document.documentElement;
    setTheme(root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    let stored: string | null = null;
    try {
      stored = localStorage.getItem('mr-theme');
    } catch {
      // Storage blocked: follow the system.
    }
    if (stored === 'light' || stored === 'dark') return;
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const follow = () => {
      const next = query.matches ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      setTheme(next);
    };
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('mr-theme', next);
    } catch {
      // Private browsing can reject writes — the toggle still works for the
      // session, it just will not be remembered.
    }
  };

  return (
    <button
      type="button"
      className="mr-btn mr-btn-icon"
      onClick={toggle}
      /* A single glyph gives the button no width of its own, so `mr-btn-icon`
         supplies the hit area. The label states the action, not the state —
         `aria-pressed` would leave "pressed" ambiguous between the two themes. */
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      <span aria-hidden="true">{theme === 'dark' ? '◐' : '◑'}</span>
    </button>
  );
}
