import type { TokenMarket } from '@marketroom/core';
import { formatPercentAdaptive, formatPrice } from '@marketroom/core';
import { SOL_MINT } from '@marketroom/adapters';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { getMarkets, getSolanaProjects } from '@/lib/solana';
import { TickerToggle } from './TickerToggle';

/**
 * The price strip across the top of every page: SOL and the largest Solana
 * tokens, from the shared five-minute market pass.
 *
 * It moves on its own, as two copies of the list end to end so the loop is
 * seamless. Anyone can stop it: it pauses under the pointer and while focus is
 * inside, a button pauses it for good, and with reduced motion requested it
 * stays still and scrolls by hand instead. The second copy is hidden from
 * assistive technology and the keyboard.
 */

const COUNT = 18;

export async function Ticker() {
  const [markets, projects] = await Promise.all([
    getMarkets(),
    getSolanaProjects().catch(() => []),
  ]);
  const projectByMint = new Map(
    projects.filter((p) => p.tokenMint).map((p) => [p.tokenMint!, p.slug]),
  );

  const unique = [
    ...new Map(
      Object.values(markets.byKey)
        .filter((m) => m.mint)
        .map((m) => [m.mint!, m]),
    ).values(),
  ];
  const sol = markets.byKey[SOL_MINT];
  // Stablecoins are left out: a price strip showing USDC at $0.9997 is noise.
  const isStable = (m: TokenMarket) =>
    /usd|eur/i.test(m.symbol) && (m.price ?? 0) > 0.8 && (m.price ?? 0) < 1.25;
  const rest = unique
    .filter(
      (m) =>
        m.key !== SOL_MINT &&
        m.verified &&
        !isStable(m) &&
        (m.marketCap ?? 0) > 0 &&
        (m.liquidity ?? 0) >= 250_000,
    )
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
    .slice(0, COUNT - 1);
  const items: TokenMarket[] = [...(sol ? [sol] : []), ...rest];
  if (items.length === 0) return <div className="rx-ticker" aria-hidden="true" />;

  const renderList = (copy: boolean) => (
    <ul className="rx-ticker-list" aria-hidden={copy || undefined}>
      {items.map((m) => {
        const slug = m.mint ? projectByMint.get(m.mint) : undefined;
        const body = (
          <>
            <span className="rx-ticker-sym">{m.symbol}</span>
            <span className="mr-num">{formatPrice(m.price)}</span>
            {m.change24h !== null && (
              <span className={`mr-num ${m.change24h >= 0 ? 'rx-up' : 'rx-down'}`}>
                {formatPercentAdaptive(m.change24h, { signed: true })}
              </span>
            )}
          </>
        );
        return (
          <li key={m.key}>
            {slug ? (
              <Link
                href={`/projects/${slug}`}
                className="rx-ticker-item"
                prefetch={false}
                tabIndex={copy ? -1 : undefined}
              >
                {body}
              </Link>
            ) : (
              <a
                href={`https://jup.ag/tokens/${m.mint}`}
                className="rx-ticker-item"
                target="_blank"
                rel="noopener noreferrer"
                tabIndex={copy ? -1 : undefined}
              >
                {body}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="rx-ticker" role="region" aria-label="Solana token prices">
      <div className="rx-ticker-viewport">
        <div
          className="rx-ticker-track"
          // About 3.5 seconds per token: slow enough to read a price in passing.
          style={
            { '--rx-ticker-duration': `${Math.max(30, items.length * 3.5)}s` } as CSSProperties
          }
        >
          {renderList(false)}
          {renderList(true)}
        </div>
      </div>
      <TickerToggle />
    </div>
  );
}
