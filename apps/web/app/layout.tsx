import '@marketroom/ui/tokens.css';
import './globals.css';

import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';
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

export const viewport: Viewport = {
  themeColor: '#0b0c0e',
  width: 'device-width',
  initialScale: 1,
};

const NAV = [
  { href: '/', label: 'Markets' },
  { href: '/trends', label: 'Trends' },
  { href: '/about', label: 'Method' },
];

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
              <span className="mr-brand-mark" aria-hidden="true">
                M
              </span>
              <span className="mr-brand-text">
                Marketroom
                <span className="mr-brand-sub">Tokenized equities</span>
              </span>
            </Link>

            <nav className="mr-nav" aria-label="Primary">
              {NAV.map((item) => (
                /* prefetch is the default in the App Router; stated explicitly
                   because instant navigation is a product requirement here. */
                <Link key={item.href} href={item.href} prefetch className="mr-nav-link">
                  {item.label}
                </Link>
              ))}
            </nav>

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
