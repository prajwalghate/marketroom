import type { AssetView } from '@marketroom/core';
import {
  formatCompactUsd,
  formatPercentAbs,
  topByVolume,
  topDislocations,
  topGainers,
  topLosers,
} from '@marketroom/core';
import { Badge, EmptyState } from '@marketroom/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Market pulse — the layer between the hero and the raw table.
 *
 * Without it the homepage asks the reader to derive every insight themselves
 * from 111 rows. These three panels answer the questions someone actually
 * arrives with: what moved, where do venues disagree, and what is liquid.
 *
 * All objective metrics — no "best" or "top pick" framing. The product surfaces
 * what the data says and leaves interpretation to the reader.
 */
export function MarketPulse({ assets }: { assets: readonly AssetView[] }) {
  const gainers = topGainers(assets, 4);
  const losers = topLosers(assets, 4);
  const dislocations = topDislocations(assets, 4);
  const volume = topByVolume(assets, 4);

  return (
    <section className="mr-pulse" aria-label="Market pulse">
      <Panel
        title="Biggest movers"
        hint="24h change, from the venue with the most volume"
        href="/trends"
      >
        {gainers.length === 0 && losers.length === 0 ? (
          <Quiet>No market has moved in the last 24 hours.</Quiet>
        ) : (
          <ul className="mr-pulse-list">
            {[...gainers.slice(0, 2), ...losers.slice(0, 2)].map(({ view, change }) => (
              <Row
                key={view.asset.id}
                id={view.asset.id}
                symbol={view.asset.symbol}
                name={view.asset.name}
                value={
                  <span className={change >= 0 ? 'mr-right-yes' : 'mr-right-no'}>
                    <span aria-hidden="true">{change >= 0 ? '▲' : '▼'}</span>{' '}
                    {formatPercentAbs(change)}
                  </span>
                }
              />
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Venue dislocations"
        hint="Same underlying, different price across venues"
        href="/trends"
      >
        {dislocations.length === 0 ? (
          <Quiet>No asset is quoted on more than one venue right now.</Quiet>
        ) : (
          <ul className="mr-pulse-list">
            {dislocations.map(({ view, spread }) => (
              <Row
                key={view.asset.id}
                id={view.asset.id}
                symbol={view.asset.symbol}
                name={view.asset.name}
                value={
                  <Badge tone={spread.fraction > 0.01 ? 'warn' : 'neutral'} mono>
                    {formatPercentAbs(spread.fraction)}
                  </Badge>
                }
              />
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Most traded" hint="24h notional, summed across venues" href="/trends">
        {volume.length === 0 ? (
          <Quiet>No volume reported.</Quiet>
        ) : (
          <ul className="mr-pulse-list">
            {volume.map(({ view, volumeUsd }) => (
              <Row
                key={view.asset.id}
                id={view.asset.id}
                symbol={view.asset.symbol}
                name={view.asset.name}
                value={<span className="mr-num mr-pulse-muted">{formatCompactUsd(volumeUsd)}</span>}
              />
            ))}
          </ul>
        )}
      </Panel>
    </section>
  );
}

function Panel({
  title,
  hint,
  href,
  children,
}: {
  title: string;
  hint: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <article className="mr-pulse-panel">
      <header className="mr-pulse-head">
        <h2 className="mr-pulse-title">{title}</h2>
        <Link href={href} className="mr-pulse-more" prefetch>
          All
          <span className="sr-only"> {title.toLowerCase()}</span> →
        </Link>
      </header>
      <p className="mr-pulse-hint">{hint}</p>
      {children}
    </article>
  );
}

function Row({
  id,
  symbol,
  name,
  value,
}: {
  id: string;
  symbol: string;
  name: string;
  value: ReactNode;
}) {
  return (
    <li>
      <Link href={`/market/${id}`} className="mr-pulse-row" prefetch>
        <span className="mr-pulse-id">
          <span className="mr-num mr-pulse-symbol">{symbol}</span>
          <span className="mr-pulse-name">{name}</span>
        </span>
        {value}
      </Link>
    </li>
  );
}

/** A panel with nothing to show says so, rather than rendering an empty box. */
function Quiet({ children }: { children: ReactNode }) {
  return <p className="mr-pulse-quiet">{children}</p>;
}

/** Re-exported so the homepage can use the same empty treatment if needed. */
export { EmptyState };
