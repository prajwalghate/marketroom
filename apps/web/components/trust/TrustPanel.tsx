import type { AssetTrust, ListingTrust } from '@marketroom/core';
import {
  formatBound,
  formatNotional,
  formatPercentAdaptive,
  formatPrice,
  formatThreshold,
  referenceFor,
  TRADABLE_SLIPPAGE,
} from '@marketroom/core';
import { InstrumentBadge, VenueBadge } from '@marketroom/ui';
import Link from 'next/link';
import { RelativeTime } from '../RelativeTime';
import { FillCurve, type CurveSeries } from './FillCurve';
import { CHECK_SHORT, seriesName, StatusGlyph, VerdictBadge } from './TrustBits';

/**
 * The trust check, at the top of every market page.
 *
 * Ordered the way a careful reader would ask: what's the verdict, can I trade
 * the gap I'm looking at, show me the curve, show me the receipts. Every
 * figure is from a measurement pass dated in the header — a trust surface that
 * does not say when it looked is asking to be trusted rather than checked.
 */
export function TrustPanel({ trust, now }: { trust: AssetTrust; now: number }) {
  const { view, listings, realGap } = trust;
  const reference = referenceFor(view);
  const measured = listings.map((l) => l.measuredAt).filter((t): t is number => t !== null);
  const measuredAt = measured.length ? Math.min(...measured) : null;

  // The chart needs one zero line. The venue's oracle when there is one; for a
  // single-venue asset, the price that venue displays — so the chart reads as
  // "shown price vs. what you'd get".
  const anchorListing = listings.find((l) => l.displayedPrice !== null);
  const anchor = reference
    ? { price: reference.price, label: reference.source }
    : anchorListing?.displayedPrice
      ? { price: anchorListing.displayedPrice, label: 'shown price' }
      : null;

  const series: CurveSeries[] = listings.map((l) => ({
    listingId: l.listingId,
    venue: l.venue,
    kind: l.kind,
    verdict: l.verdict,
    points: (l.probe?.fills ?? []).map((f) => ({
      side: f.side,
      notionalUsd: f.notionalUsd,
      price: f.price,
    })),
  }));

  return (
    <section className="mr-trust" aria-labelledby="trust-heading">
      <header className="mr-trust-head">
        <h2 id="trust-heading" className="mr-trust-title">
          Trust check
        </h2>
        <p className="mr-trust-meta">
          {measuredAt !== null ? (
            <>
              Fills measured <RelativeTime epochMs={measuredAt} serverNow={now} />
            </>
          ) : (
            'Not measured yet'
          )}
          <span aria-hidden="true"> · </span>
          <Link href="/about#method" className="mr-trust-link">
            How we measure
          </Link>
        </p>
      </header>

      <div className="mr-trust-cards">
        {listings.map((l) => (
          <VerdictCard key={l.listingId} trust={l} />
        ))}
      </div>

      {realGap && (
        <p className="mr-trust-gap">
          <span className="mr-trust-gap-label">The gap on screen</span>
          {realGap.executable === null ? (
            <>
              {view.asset.symbol} shows{' '}
              <strong className="mr-num">{formatPercentAdaptive(realGap.paper)}</strong> apart
              across venues, but one side cannot fill {formatNotional(realGap.notionalUsd)} at all —
              there is no trade behind the gap.
            </>
          ) : (
            <>
              {view.asset.symbol} shows{' '}
              <strong className="mr-num">{formatPercentAdaptive(realGap.paper)}</strong> apart.
              Buying {formatNotional(realGap.notionalUsd)} on {venueWord(realGap.buy.venue)} at{' '}
              <span className="mr-num">{formatPrice(realGap.buy.price)}</span> and selling on{' '}
              {venueWord(realGap.sell.venue)} at{' '}
              <span className="mr-num">{formatPrice(realGap.sell.price)}</span> returns{' '}
              <strong
                className={realGap.executable > 0 ? 'mr-num mr-trust-pos' : 'mr-num mr-trust-neg'}
              >
                {formatPercentAdaptive(realGap.executable, { signed: true })}
              </strong>{' '}
              before fees and funding.{' '}
              {realGap.executable > 0
                ? 'At this size, the gap is real.'
                : 'At this size, the gap does not survive execution.'}
            </>
          )}
        </p>
      )}

      {anchor && series.some((s) => s.points.some((p) => p.price !== null)) && (
        <div className="mr-trust-chart">
          <h3 className="mr-trust-subhead">Price at size</h3>
          <FillCurve series={series} anchor={anchor} />
        </div>
      )}

      <div className="mr-trust-receipts">
        <h3 className="mr-trust-subhead">Receipts</h3>
        {listings.map((l) => (
          <Receipts key={l.listingId} trust={l} />
        ))}
      </div>
    </section>
  );
}

const venueWord = (venue: string) => (venue === 'hyperliquid' ? 'Hyperliquid' : 'Solana');

function VerdictCard({ trust }: { trust: ListingTrust }) {
  return (
    <article className={`mr-vcard is-${trust.verdict}`}>
      <header className="mr-vcard-head">
        <span className="mr-vcard-venue">
          <VenueBadge venue={trust.venue} />
          <InstrumentBadge kind={trust.kind} align="start" />
        </span>
        <VerdictBadge verdict={trust.verdict} size="lg" />
      </header>

      <p className="mr-vcard-headline">{trust.headline}</p>

      <dl className="mr-vcard-stats">
        <div>
          <dt>Largest trade within {formatThreshold(TRADABLE_SLIPPAGE)}</dt>
          <dd className="mr-num">
            {trust.withinOnePercent ? formatBound(trust.withinOnePercent) : '—'}
          </dd>
        </div>
        <div>
          <dt>Round trip at $10k</dt>
          <dd className="mr-num">{formatPercentAdaptive(trust.roundTrip)}</dd>
        </div>
        <div>
          <dt>Shown price</dt>
          <dd className="mr-num">{formatPrice(trust.displayedPrice)}</dd>
        </div>
      </dl>

      <ul className="mr-vcard-checks" aria-label="Checks">
        {trust.checks.map((check) => (
          <li key={check.id} className={`is-${check.status}`} title={check.finding}>
            <StatusGlyph status={check.status} />
            {CHECK_SHORT[check.id]}
          </li>
        ))}
      </ul>
    </article>
  );
}

function Receipts({ trust }: { trust: ListingTrust }) {
  const passed = trust.checks.filter((c) => c.status === 'pass').length;
  return (
    <details className="mr-receipt">
      <summary className="mr-receipt-summary">
        <span className="mr-receipt-name">{seriesName(trust.venue, trust.kind)}</span>
        <span className="mr-receipt-count">
          {passed} of {trust.checks.length} checks passed
        </span>
      </summary>
      <ol className="mr-receipt-list">
        {trust.checks.map((check) => (
          <li key={check.id} className="mr-receipt-item">
            <StatusGlyph status={check.status} />
            <div className="mr-receipt-body">
              <p className="mr-receipt-q">{check.question}</p>
              <p className="mr-receipt-finding">{check.finding}</p>
              {check.receipts.length > 0 && (
                <dl className="mr-receipt-evidence">
                  {check.receipts.map((r) => (
                    <div key={r.label}>
                      <dt>{r.label}</dt>
                      <dd className="mr-num">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {check.source && <p className="mr-receipt-source">Source: {check.source}</p>}
            </div>
          </li>
        ))}
      </ol>
      {trust.probe && (
        <table className="mr-receipt-fills">
          <caption>Every fill measured</caption>
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Buy fills at</th>
              <th scope="col">Sell fills at</th>
              <th scope="col">Method</th>
            </tr>
          </thead>
          <tbody>
            {[...new Set(trust.probe.fills.map((f) => f.notionalUsd))]
              .sort((a, b) => a - b)
              .map((size) => {
                const at = (side: 'buy' | 'sell') =>
                  trust.probe!.fills.find((f) => f.side === side && f.notionalUsd === size);
                const buy = at('buy');
                const sell = at('sell');
                const cell = (fill: typeof buy) =>
                  fill?.price != null ? (
                    formatPrice(fill.price)
                  ) : (
                    <span className="mr-receipt-nofill">
                      {fill?.failure === 'error' ? 'not measured' : 'no fill'}
                    </span>
                  );
                return (
                  <tr key={size}>
                    <th scope="row" className="mr-num">
                      {formatNotional(size)}
                    </th>
                    <td className="mr-num">{cell(buy)}</td>
                    <td className="mr-num">{cell(sell)}</td>
                    <td>{methodWord(buy?.method ?? sell?.method)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      )}
    </details>
  );
}

function methodWord(method: string | undefined): string {
  switch (method) {
    case 'book':
      return 'Order book';
    case 'book-aggregated':
      return 'Aggregated book (conservative)';
    case 'route':
      return 'Routed swap quote';
    default:
      return '—';
  }
}
