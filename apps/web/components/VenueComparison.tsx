import type { AssetView } from '@marketroom/core';
import {
  formatCompactUsd,
  formatCount,
  formatFunding,
  formatPercentAbs,
  formatPrice,
  priceChange24h,
  venueSpread,
} from '@marketroom/core';
import { Badge, InstrumentBadge, PriceChange, VenueBadge } from '@marketroom/ui';

/**
 * Cross-venue comparison.
 *
 * This component is the product. Everything else — the index, the chart, the
 * search — is in service of this view: the same underlying, listed as two
 * structurally different instruments, with the differences stated rather than
 * implied.
 *
 * The brand thesis is that "the same ticker can hide very different products:
 * share ownership, a custody-backed token, or price exposure". A table of
 * prices alone would actively obscure that, so holder rights are shown next to
 * the price, not buried in a disclaimer.
 */

const RIGHTS: { key: 'ownership' | 'dividends' | 'voting' | 'redeemable'; label: string }[] = [
  { key: 'ownership', label: 'Ownership' },
  { key: 'dividends', label: 'Dividends' },
  { key: 'voting', label: 'Voting' },
  { key: 'redeemable', label: 'Redeemable' },
];

export function VenueComparison({ view }: { view: AssetView }) {
  const spread = venueSpread(view);
  const multi = view.listings.length > 1;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {multi && spread && (
        <p
          style={{
            margin: 0,
            fontSize: 'var(--mr-text-xs)',
            color: 'var(--mr-text-muted)',
            lineHeight: 1.6,
          }}
        >
          {view.asset.symbol} trades {formatPercentAbs(spread.fraction)} apart across venues —{' '}
          {formatPrice(spread.low.quote?.price ?? null)} on {spread.low.listing.venue} versus{' '}
          {formatPrice(spread.high.quote?.price ?? null)} on {spread.high.listing.venue}. These are
          different instruments, so a gap is normal; a persistent one is worth understanding.
        </p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(260px, 1fr))`,
          gap: 12,
        }}
      >
        {view.listings.map(({ listing, quote }) => {
          const change = quote ? priceChange24h(quote) : null;

          return (
            <div
              key={listing.id}
              /* A column so the rights row and CTA can be pushed to the bottom:
                 a perp lists funding and leverage where a token lists holders
                 and an issuer, so the two cards' metric blocks are different
                 heights and the Trade buttons would otherwise sit at different
                 vertical positions — which makes them hard to compare. */
              style={{
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--mr-surface-1)',
                border: '1px solid var(--mr-border)',
                borderRadius: 'var(--mr-radius-lg)',
                padding: 15,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <VenueBadge venue={listing.venue} />
                <InstrumentBadge kind={listing.kind} />
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
                <span className="mr-num" style={{ fontSize: 'var(--mr-text-xl)', fontWeight: 600 }}>
                  {formatPrice(quote?.price ?? null)}
                </span>
                <PriceChange
                  fraction={change?.fraction ?? null}
                  direction={change?.direction}
                  size="sm"
                />
              </div>

              {/* Venue-specific metrics. Each venue reports what it actually
                  has — a perp has open interest and funding, a token has pool
                  liquidity and holders. Showing a dash for every absent metric
                  would be noise. */}
              <dl
                style={{
                  margin: '0 0 12px',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '6px 10px',
                  fontSize: 'var(--mr-text-xs)',
                }}
              >
                <Row label="24h volume" value={formatCompactUsd(quote?.volume24h ?? null)} />
                {quote?.openInterest != null && (
                  <Row label="Open interest" value={formatCompactUsd(quote.openInterest)} />
                )}
                {quote?.liquidity != null && (
                  <Row label="Pool liquidity" value={formatCompactUsd(quote.liquidity)} />
                )}
                {quote?.fundingRate != null && (
                  <Row label="Funding (1h)" value={formatFunding(quote.fundingRate)} />
                )}
                {quote?.holders != null && (
                  <Row label="Holders" value={formatCount(quote.holders)} />
                )}
                {listing.maxLeverage > 1 && (
                  <Row label="Max leverage" value={`${listing.maxLeverage}×`} />
                )}
                {listing.issuer && <Row label="Issuer" value={listing.issuer} />}
              </dl>

              {/* Holder rights — the substantive difference between a perp and
                  a custody-backed token, and the reason this product exists. */}
              <ul
                style={{
                  margin: '0 0 12px',
                  padding: 0,
                  listStyle: 'none',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 5,
                }}
              >
                {RIGHTS.map((right) => {
                  const granted = listing.rights[right.key];
                  return (
                    <li key={right.key}>
                      <Badge tone={granted ? 'up' : 'neutral'}>
                        {/* A bare ✓/✕ is read aloud as "check mark"/"multiply"
                            or skipped entirely, which inverts the meaning of
                            the most consequential labels on the page. */}
                        <span aria-hidden="true">{granted ? '✓' : '✕'}</span>
                        <span className="sr-only">{granted ? 'Yes: ' : 'No: '}</span>
                        {right.label}
                      </Badge>
                    </li>
                  );
                })}
              </ul>

              <a
                href={listing.tradeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mr-btn mr-btn-primary"
                style={{ width: '100%', textDecoration: 'none' }}
              >
                Trade on {listing.venue === 'hyperliquid' ? 'trade[XYZ]' : 'Jupiter'}
                <span aria-hidden="true">↗</span>
                {/* The glyph is the only signal that this leaves the site. */}
                <span className="sr-only">(opens in a new tab)</span>
              </a>

              {/* `margin-top: auto` absorbs the cards' height difference here,
                  below the CTA rather than above it. The perp disclaimer always
                  runs a line longer than the token one, so without this the two
                  Trade buttons sat ~17px apart — the one pair of elements a
                  reader is most likely to compare across the cards. */}
              <p
                style={{
                  margin: 'auto 0 0',
                  paddingTop: 9,
                  fontSize: 'var(--mr-text-2xs)',
                  color: 'var(--mr-text-subtle)',
                  lineHeight: 1.5,
                }}
              >
                {listing.kind === 'perpetual'
                  ? 'Synthetic perpetual tracking an oracle price. Leveraged exposure only — no ownership, dividends or voting. Carries liquidation, oracle and deployer risk.'
                  : 'Custody-backed token. Redeemable for the underlying share, subject to issuer terms and eligibility. Carries issuer and custody risk.'}
              </p>
            </div>
          );
        })}
      </div>

      {!multi && (
        <p
          style={{
            margin: 0,
            fontSize: 'var(--mr-text-xs)',
            color: 'var(--mr-text-subtle)',
            lineHeight: 1.6,
          }}
        >
          Only one venue currently lists {view.asset.symbol}. When a second appears, this view will
          compare them side by side.
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt style={{ color: 'var(--mr-text-subtle)' }}>{label}</dt>
      <dd
        className="mr-num"
        style={{ margin: 0, textAlign: 'right', color: 'var(--mr-text-muted)' }}
      >
        {value}
      </dd>
    </>
  );
}
