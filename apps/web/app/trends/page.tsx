import type { AssetView } from '@marketroom/core';
import {
  aggregateVolume24h,
  formatCompactUsd,
  formatPercent,
  primaryListing,
  priceChange24h,
  venueSpread,
} from '@marketroom/core';
import { Badge, PriceChange, SectionTitle } from '@marketroom/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSnapshot } from '@/lib/data';

/**
 * Trends — market-wide movement.
 *
 * Everything here is derived from the same cached snapshot the index page uses,
 * so this route costs no additional upstream requests. Navigating between the
 * two is a cache hit and therefore instant.
 */

export const revalidate = 15;

export const metadata: Metadata = {
  title: 'Trends',
  description: 'Movers, sector performance and cross-venue dislocations across tokenized equities.',
};

interface Scored {
  view: AssetView;
  change: number;
}

export default async function TrendsPage() {
  const snapshot = await getSnapshot();

  const scored: Scored[] = snapshot.assets.flatMap((view) => {
    const primary = primaryListing(view);
    if (!primary?.quote) return [];
    const change = priceChange24h(primary.quote);
    if (!change) return [];
    return [{ view, change: change.fraction }];
  });

  const gainers = [...scored].sort((a, b) => b.change - a.change).slice(0, 10);
  const losers = [...scored].sort((a, b) => a.change - b.change).slice(0, 10);

  const byVolume = [...snapshot.assets]
    .sort((a, b) => (aggregateVolume24h(b) ?? 0) - (aggregateVolume24h(a) ?? 0))
    .slice(0, 10);

  // Cross-venue dislocations — only computable because one asset holds many
  // listings. Nothing in the reference could produce this view.
  const dislocations = snapshot.assets
    .flatMap((view) => {
      const spread = venueSpread(view);
      return spread ? [{ view, spread }] : [];
    })
    .sort((a, b) => b.spread.fraction - a.spread.fraction)
    .slice(0, 8);

  const sectors = aggregateBySector(scored);

  return (
    <div className="mr-container">
      <h1
        style={{
          margin: '0 0 6px',
          fontSize: 'var(--mr-text-2xl)',
          fontWeight: 600,
          letterSpacing: '-0.02em',
        }}
      >
        Trends
      </h1>
      <p style={{ margin: '0 0 26px', color: 'var(--mr-text-muted)', maxWidth: '64ch' }}>
        What is moving across the tokenized equity market in the last 24 hours.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 22,
          marginBottom: 30,
        }}
      >
        <section>
          <SectionTitle>Top gainers</SectionTitle>
          <MoverList items={gainers} />
        </section>

        <section>
          <SectionTitle>Top losers</SectionTitle>
          <MoverList items={losers} />
        </section>
      </div>

      <section style={{ marginBottom: 30 }}>
        <SectionTitle>Sector performance · 24h</SectionTitle>
        <div style={{ display: 'grid', gap: 5 }}>
          {sectors.map((sector) => (
            <SectorBar
              key={sector.name}
              {...sector}
              max={Math.max(...sectors.map((s) => Math.abs(s.average)))}
            />
          ))}
        </div>
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 22,
        }}
      >
        <section>
          <SectionTitle>Most traded</SectionTitle>
          <div
            style={{
              display: 'grid',
              gap: 1,
              background: 'var(--mr-border)',
              border: '1px solid var(--mr-border)',
              borderRadius: 'var(--mr-radius-lg)',
              overflow: 'hidden',
            }}
          >
            {byVolume.map((view) => (
              <Link
                key={view.asset.id}
                href={`/market/${view.asset.id}`}
                prefetch
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '9px 13px',
                  background: 'var(--mr-surface-1)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span className="mr-num" style={{ fontWeight: 500 }}>
                  {view.asset.symbol}
                </span>
                <span
                  className="mr-num"
                  style={{ fontSize: 'var(--mr-text-xs)', color: 'var(--mr-text-muted)' }}
                >
                  {formatCompactUsd(aggregateVolume24h(view))}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle
            action={
              <span style={{ fontSize: 'var(--mr-text-2xs)', color: 'var(--mr-text-subtle)' }}>
                same ticker, different venues
              </span>
            }
          >
            Cross-venue dislocations
          </SectionTitle>
          {dislocations.length === 0 ? (
            <p style={{ fontSize: 'var(--mr-text-sm)', color: 'var(--mr-text-subtle)' }}>
              No assets are currently quoted on more than one venue.
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gap: 1,
                background: 'var(--mr-border)',
                border: '1px solid var(--mr-border)',
                borderRadius: 'var(--mr-radius-lg)',
                overflow: 'hidden',
              }}
            >
              {dislocations.map(({ view, spread }) => (
                <Link
                  key={view.asset.id}
                  href={`/market/${view.asset.id}`}
                  prefetch
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    padding: '9px 13px',
                    background: 'var(--mr-surface-1)',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <span className="mr-num" style={{ fontWeight: 500 }}>
                    {view.asset.symbol}
                  </span>
                  <Badge tone={spread.fraction > 0.01 ? 'warn' : 'neutral'} mono>
                    {formatPercent(spread.fraction, 2).replace('+', '')}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MoverList({ items }: { items: Scored[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 1,
        background: 'var(--mr-border)',
        border: '1px solid var(--mr-border)',
        borderRadius: 'var(--mr-radius-lg)',
        overflow: 'hidden',
      }}
    >
      {items.map(({ view, change }) => (
        <Link
          key={view.asset.id}
          href={`/market/${view.asset.id}`}
          prefetch
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            padding: '9px 13px',
            background: 'var(--mr-surface-1)',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <span style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="mr-num" style={{ fontWeight: 500 }}>
              {view.asset.symbol}
            </span>
            <span
              style={{
                fontSize: 'var(--mr-text-xs)',
                color: 'var(--mr-text-subtle)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 150,
              }}
            >
              {view.asset.name}
            </span>
          </span>
          <PriceChange fraction={change} />
        </Link>
      ))}
    </div>
  );
}

interface SectorStat {
  name: string;
  average: number;
  count: number;
}

function aggregateBySector(scored: Scored[]): SectorStat[] {
  const buckets = new Map<string, number[]>();
  for (const { view, change } of scored) {
    const sector = view.asset.taxonomy.sector;
    const bucket = buckets.get(sector);
    if (bucket) bucket.push(change);
    else buckets.set(sector, [change]);
  }

  return [...buckets.entries()]
    .map(([name, changes]) => ({
      name,
      average: changes.reduce((sum, value) => sum + value, 0) / changes.length,
      count: changes.length,
    }))
    .sort((a, b) => b.average - a.average);
}

function SectorBar({ name, average, count, max }: SectorStat & { max: number }) {
  const positive = average >= 0;
  // Bars extend from a centre line so positive and negative are directly
  // comparable in magnitude, not just in colour.
  const width = max === 0 ? 0 : (Math.abs(average) / max) * 50;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '180px 1fr 72px',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span style={{ fontSize: 'var(--mr-text-xs)', color: 'var(--mr-text-muted)' }}>
        {name}
        <span className="mr-num" style={{ color: 'var(--mr-text-subtle)', marginLeft: 6 }}>
          {count}
        </span>
      </span>

      <div
        style={{
          position: 'relative',
          height: 18,
          background: 'var(--mr-surface-2)',
          borderRadius: 'var(--mr-radius-sm)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            bottom: 0,
            width: 1,
            background: 'var(--mr-border-strong)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 3,
            bottom: 3,
            [positive ? 'left' : 'right']: '50%',
            width: `${width}%`,
            background: positive ? 'var(--mr-up)' : 'var(--mr-down)',
            opacity: 0.72,
            borderRadius: 2,
          }}
        />
      </div>

      <span
        className="mr-num"
        style={{
          fontSize: 'var(--mr-text-xs)',
          textAlign: 'right',
          color: positive ? 'var(--mr-up)' : 'var(--mr-down)',
        }}
      >
        {formatPercent(average)}
      </span>
    </div>
  );
}
