'use client';

import { useEffect, useState } from 'react';

/**
 * Light/dark toggle.
 *
 * The initial theme is applied by an inline script in `layout.tsx` before
 * first paint, so this component only has to stay in sync afterwards — it never
 * causes a flash of the wrong theme.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const stored = localStorage.getItem('mr-theme');
    if (stored === 'light') setTheme('light');
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
      className="mr-btn"
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      <span aria-hidden="true">{theme === 'dark' ? '◐' : '◑'}</span>
    </button>
  );
}
