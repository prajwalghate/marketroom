import '@marketroom/ui/tokens.css';
import './globals.css';
import './trust.css';
import './research.css';
import './profiles.css';
import './charts.css';

import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';
import { PrimaryNav } from '@/components/PrimaryNav';
import { Logo } from '@marketroom/ui';
import { ThemeToggle } from '@/components/ThemeToggle';
import { GlobalSearch } from '@/components/sol/GlobalSearch';
import { AlertsBell } from '@/components/sol/Watchlist';
import { Ticker } from '@/components/sol/Ticker';
import { Suspense } from 'react';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Marketroom — Solana research',
    template: '%s · Marketroom',
  },
  description:
    'Research the Solana ecosystem: every project, its funding and investors, its token and its on-chain activity — live, sourced, and dated.',
};

/**
 * The one place in the app a raw colour is unavoidable.
 *
 * `theme-color` is a `<meta>` tag the browser reads to paint its own chrome
 * before any stylesheet applies, so it cannot reference a CSS custom property.
 * These values must be kept in sync by hand with `--mr-bg` in
 * packages/ui/src/tokens.css.
 *
 * Both schemes are declared: a single dark value left a light-theme phone with
 * dark browser chrome sitting above a near-white page.
 */
/* eslint-disable no-restricted-syntax -- a meta tag cannot take a CSS var */
const THEME_COLOR = [
  { media: '(prefers-color-scheme: dark)', color: '#0b0c0e' },
  { media: '(prefers-color-scheme: light)', color: '#fcfcfd' },
];
/* eslint-enable no-restricted-syntax */

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <body>
        {/* Theme, and a paused price ticker, are applied before first paint to
            avoid a flash of the wrong state. Inline by necessity — any
            external script would be too late. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement,t=null,k=null;try{t=localStorage.getItem('mr-theme');k=localStorage.getItem('mr-ticker');}catch(e){}if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}d.setAttribute('data-theme',t);if(k==='paused')d.setAttribute('data-ticker','paused');}catch(e){}})();`,
          }}
        />

        <a href="#main" className="mr-skip-link">
          Skip to content
        </a>

        {/* Above the header, outside it: a price strip is information, not
            navigation, and should not sit inside the sticky chrome. */}
        <Suspense fallback={<div className="rx-ticker" aria-hidden="true" />}>
          <Ticker />
        </Suspense>

        <header className="mr-header">
          <div className="mr-header-inner">
            <Link href="/" className="mr-brand" aria-label="Marketroom home">
              <Logo className="mr-brand-mark" />
              <span className="mr-brand-text">
                Marketroom
                <span className="mr-brand-sub">Solana research</span>
              </span>
            </Link>

            <PrimaryNav />

            <GlobalSearch />

            {/* Narrow screens have no room for the search box: a link to the search page instead. */}
            <Link href="/search" className="mr-btn-icon rx-search-icon" aria-label="Search">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </Link>

            <AlertsBell />

            <Link
              href="/watchlist"
              className="mr-btn-icon rx-watch-link"
              aria-label="Watchlist"
              title="Watchlist"
            >
              <span aria-hidden="true">★</span>
            </Link>

            <ThemeToggle />
          </div>
        </header>

        <main id="main" className="mr-main">
          {children}
        </main>

        <footer className="mr-footer">
          <div className="mr-footer-inner">
            <p>
              Records from DefiLlama, Jupiter, OtterSec, GitHub, the Solana network and the
              announcements they cite — every fact links to its source and the date it was checked.
              Marketroom is not affiliated with any project, investor, venue or issuer it lists.
            </p>
            <p>
              <Link href="/api-docs">Free JSON API</Link> ·{' '}
              <Link href="/method">How the database works</Link> ·{' '}
              <Link href="/about">Tokenized-asset method</Link> ·{' '}
              <Link href="/updates">Updates</Link> · <Link href="/watchlist">Your watchlist</Link> ·{' '}
              <Link href="/admin">Editors</Link>
            </p>
            <p>
              <strong>Not investment advice.</strong> Funding figures are those disclosed publicly;
              undisclosed rounds are shown as undisclosed, never as zero. Verify every figure at its
              source before acting on it.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
