import '@marketroom/ui/tokens.css';
import './globals.css';

import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';
import { PrimaryNav } from '@/components/PrimaryNav';
import { Logo } from '@marketroom/ui';
import { ThemeToggle } from '@/components/ThemeToggle';

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
    default: 'Marketroom — tokenized equities across chains',
    template: '%s · Marketroom',
  },
  description:
    'Every tokenized equity, across every venue. Compare the same ticker as a perpetual on Hyperliquid and a custody-backed token on Solana — live prices, structure and holder rights side by side.',
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
        {/* Theme is applied before first paint to avoid a flash of the wrong
            theme. Inline by necessity — any external script would be too late. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('mr-theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}})();`,
          }}
        />

        <a href="#main" className="mr-skip-link">
          Skip to content
        </a>

        <header className="mr-header">
          <div className="mr-header-inner">
            <Link href="/" className="mr-brand" aria-label="Marketroom home">
              <Logo className="mr-brand-mark" />
              <span className="mr-brand-text">
                Marketroom
                <span className="mr-brand-sub">Tokenized equities</span>
              </span>
            </Link>

            <PrimaryNav />

            <ThemeToggle />
          </div>
        </header>

        <main id="main" className="mr-main">
          {children}
        </main>

        <footer className="mr-footer">
          <div className="mr-footer-inner">
            <p>
              Marketroom aggregates public market data. It is not affiliated with Hyperliquid,
              trade[XYZ], Backed Finance or any issuer.
            </p>
            <p>
              <strong>Not investment advice.</strong> Perpetual futures confer leveraged price
              exposure, not ownership. Tokenized equities carry issuer, custody and redemption risk.
              Verify every figure before acting on it.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
