import {
  aggregateVolume24h,
  consolidatedPrice,
  countryFlag,
  formatCompactUsd,
  formatPeRatio,
  formatPrice,
  primaryListing,
  priceChange24h,
  seriesChange,
  venueSpread,
} from '@marketroom/core';
import { assetById } from '@marketroom/catalog';
import { Badge, PriceChange, SectionTitle } from '@marketroom/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CandleChart } from '@/components/CandleChart';
import { ExposurePanel, ExposurePanelFallback } from '@/components/ExposurePanel';
import { ProductStructure, RiskCallout } from '@/components/ProductStructure';
import { DepthPanel } from '@/components/DepthPanel';
import { VenueComparison } from '@/components/VenueComparison';
import { getAssetView, getCandles, getOrderBook, getSnapshot } from '@/lib/data';
import { Suspense } from 'react';

/**
 * Market detail.
 *
 * A real route rather than a modal: it can be linked, shared, bookmarked and
 * statically generated. A market is the thing people send each other, so it
 * needs an address.
 *
 * Chart data is fetched on the server and rendered into the HTML, so the chart
 * appears with the page rather than after a client-side request.
 */

export const revalidate = 15;

/** Pre-render every market at build time so navigation is a cache hit. */
export async function generateStaticParams() {
  const snapshot = await getSnapshot().catch(() => null);
  return (snapshot?.assets ?? []).slice(0, 140).map((view) => ({ id: view.asset.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const asset = assetById(id);
  if (!asset) return { title: 'Market not found' };

  return {
    title: `${asset.symbol} — ${asset.name}`,
    description: asset.summary.slice(0, 180),
  };
}

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await getAssetView(id);
  if (!view) notFound();

  const { asset } = view;
  const primary = primaryListing(view);
  const price = consolidatedPrice(view);
  const change = primary?.quote ? priceChange24h(primary.quote) : null;
  const volume = aggregateVolume24h(view);
  const spread = venueSpread(view);

  // Charts and depth exist only where a venue supports them. Fetched in
  // parallel so the slowest one bounds the page, not the sum.
  const chartable = view.listings.find(({ listing }) => listing.venue === 'hyperliquid')?.listing;
  const [candles, book] = await Promise.all([
    chartable ? getCandles(chartable, '1h') : Promise.resolve([]),
    chartable ? getOrderBook(chartable) : Promise.resolve(null),
  ]);

  const chartChange = seriesChange(candles);

  const snapshot = await getSnapshot();
  const peers = asset.peers
    .map((peerId) => snapshot.assets.find((entry) => entry.asset.id === peerId))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .slice(0, 6);

  return (
    <div className="mr-container">
      {/* An ordered list, not two spans: the breadcrumb is a sequence, and a
          screen reader should be able to say how many levels deep it is. */}
      <nav style={{ marginBottom: 16, fontSize: 'var(--mr-text-xs)' }} aria-label="Breadcrumb">
        <ol
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <li>
            <Link
              href="/"
              prefetch
              className="mr-breadcrumb-link"
              style={{ color: 'var(--mr-text-subtle)' }}
            >
              Markets
            </Link>
          </li>
          <li style={{ color: 'var(--mr-text-subtle)', margin: '0 7px' }} aria-hidden="true">
            /
          </li>
          <li style={{ color: 'var(--mr-text-muted)' }} aria-current="page">
            {asset.symbol}
          </li>
        </ol>
      </nav>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 12 }}>
          <h1
            className="mr-num"
            style={{
              margin: 0,
              fontSize: 'var(--mr-text-3xl)',
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}
          >
            {asset.symbol}
          </h1>
          <span style={{ fontSize: 'var(--mr-text-md)', color: 'var(--mr-text-muted)' }}>
            {asset.name}
          </span>
          {asset.isPrivate && <Badge tone="warn">Private company</Badge>}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <Badge>{asset.taxonomy.sector}</Badge>
          <Badge>{asset.taxonomy.industry}</Badge>
          {asset.country && (
            <Badge>
              {countryFlag(asset.country)} {asset.country}
            </Badge>
          )}
          <Badge mono>{asset.assetClass}</Badge>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            gap: 14,
            marginTop: 18,
          }}
        >
          <span
            className="mr-num"
            style={{ fontSize: 'var(--mr-text-3xl)', fontWeight: 600, letterSpacing: '-0.02em' }}
          >
            {formatPrice(price)}
          </span>
          <PriceChange
            fraction={change?.fraction ?? null}
            direction={change?.direction}
            size="lg"
          />
          <span style={{ fontSize: 'var(--mr-text-xs)', color: 'var(--mr-text-subtle)' }}>
            {formatCompactUsd(volume)} 24h volume
            {view.listings.length > 1 && ` · across ${view.listings.length} venues`}
          </span>
        </div>
      </header>

      <div className="mr-grid-2">
        <div style={{ minWidth: 0 }}>
          {/* ── Chart ──────────────────────────────────────────────────── */}
          <section style={{ marginBottom: 22 }}>
            <SectionTitle
              action={
                candles.length > 1 && (
                  <span style={{ fontSize: 'var(--mr-text-xs)', color: 'var(--mr-text-subtle)' }}>
                    {/* Derived, not hardcoded: the previous copy appended a
                        dangling "·" whenever the series had no net change. */}
                    Hourly · last {Math.max(1, Math.round(candles.length / 24))} days
                  </span>
                )
              }
            >
              Price
            </SectionTitle>
            {candles.length > 1 ? (
              <CandleChart candles={candles} direction={chartChange?.direction ?? 'flat'} />
            ) : (
              /* Candles come from the perp venue only. When there is no perp
                 listing — or the venue is down — the section used to vanish
                 silently, which reads as a broken page rather than a known
                 limit of the data. */
              <p
                style={{
                  margin: 0,
                  padding: '28px 16px',
                  textAlign: 'center',
                  fontSize: 'var(--mr-text-sm)',
                  color: 'var(--mr-text-muted)',
                  background: 'var(--mr-surface-1)',
                  border: '1px dashed var(--mr-border)',
                  borderRadius: 'var(--mr-radius-lg)',
                }}
              >
                No price history for {asset.symbol}. Candles come from the Hyperliquid perpetual,
                and this market is not currently quoted there.
              </p>
            )}
          </section>

          {/* ── What this product actually is ──────────────────────────── */}
          {/* Placed above price comparison deliberately: the structural facts
              change what a price even means, so they should be read first. */}
          <section style={{ marginBottom: 22 }}>
            <SectionTitle>Product structure</SectionTitle>
            <ProductStructure view={view} />
            <RiskCallout view={view} />
          </section>

          {/* ── Cross-venue comparison — the product thesis ────────────── */}
          <section style={{ marginBottom: 22 }}>
            <SectionTitle
              action={
                spread && (
                  <Badge tone="warn" mono>
                    {(spread.fraction * 100).toFixed(2)}% spread
                  </Badge>
                )
              }
            >
              {view.listings.length > 1 ? 'Same ticker, different products' : 'Listing'}
            </SectionTitle>
            <VenueComparison view={view} />
          </section>

          {/* Streamed: measuring execution cost is slow and supplementary, so it
              must not hold back the price, chart or comparison above it. */}
          {view.listings.length > 1 && (
            <Suspense fallback={<ExposurePanelFallback />}>
              <ExposurePanel view={view} />
            </Suspense>
          )}

          {/* ── Editorial ──────────────────────────────────────────────── */}
          <section style={{ marginBottom: 22 }}>
            <SectionTitle>About</SectionTitle>
            <p
              style={{
                margin: 0,
                fontSize: 'var(--mr-text-base)',
                lineHeight: 1.7,
                color: 'var(--mr-text-muted)',
                maxWidth: '76ch',
              }}
            >
              <strong style={{ color: 'var(--mr-text)' }}>{asset.symbol}.</strong> {asset.summary}
            </p>
          </section>
        </div>

        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <aside style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section>
            <SectionTitle>Key stats</SectionTitle>
            <dl
              style={{
                margin: 0,
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: '9px 12px',
                fontSize: 'var(--mr-text-sm)',
              }}
            >
              <KeyStat label="P/E (indicative)" value={formatPeRatio(asset.peRatio)} />
              <KeyStat
                label="Max leverage"
                value={`${Math.max(...view.listings.map((l) => l.listing.maxLeverage))}×`}
              />
              <KeyStat label="24h volume" value={formatCompactUsd(volume)} />
              <KeyStat
                label="Open interest"
                value={formatCompactUsd(
                  view.listings.reduce((sum, l) => sum + (l.quote?.openInterest ?? 0), 0) || null,
                )}
              />
              <KeyStat label="Venues" value={String(view.listings.length)} />
            </dl>
          </section>

          {book && book.bids.length > 0 && (
            <section>
              <SectionTitle>Order book</SectionTitle>
              <DepthPanel book={book} />
            </section>
          )}

          {peers.length > 0 && (
            <section>
              <SectionTitle>Related</SectionTitle>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {peers.map((peer) => {
                  const peerPrimary = primaryListing(peer);
                  const peerChange = peerPrimary?.quote ? priceChange24h(peerPrimary.quote) : null;
                  return (
                    <Link
                      key={peer.asset.id}
                      href={`/market/${peer.asset.id}`}
                      prefetch
                      className="mr-chip"
                      style={{ textDecoration: 'none', display: 'inline-flex', gap: 7 }}
                    >
                      <span className="mr-num">{peer.asset.symbol}</span>
                      <PriceChange
                        fraction={peerChange?.fraction ?? null}
                        direction={peerChange?.direction}
                        showArrow={false}
                        size="sm"
                      />
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function KeyStat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt style={{ color: 'var(--mr-text-subtle)' }}>{label}</dt>
      <dd className="mr-num" style={{ margin: 0, textAlign: 'right', color: 'var(--mr-text)' }}>
        {value}
      </dd>
    </>
  );
}
