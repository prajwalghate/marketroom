import type { AssetView, Listing } from '@marketroom/core';
import { formatLeverage } from '@marketroom/core';
import { VenueBadge } from '@marketroom/ui';

/**
 * What the product actually is, per venue.
 *
 * The structural facts — ownership, backing, redeemability — were previously
 * reachable but small: badges and footnotes inside the price comparison. They
 * are the most consequential thing on the page and the only part a price chart
 * cannot tell you, so they get their own section at full size.
 *
 * Stated as plain rows with explicit "None" / "No" values rather than ticks
 * alone. A tick is ambiguous out of context ("yes it has none"?), and the
 * answer a reader needs is a word.
 */

interface StructureRow {
  readonly label: string;
  readonly value: string;
  /** Rows whose answer is a risk the reader should not skim past. */
  readonly emphasis?: 'none' | 'warn';
}

function rowsFor(listing: Listing): StructureRow[] {
  const isPerp = listing.kind === 'perpetual';

  return [
    {
      label: 'Product type',
      value: isPerp ? 'Perpetual future' : 'Tokenized security',
    },
    {
      label: 'Ownership',
      value: listing.rights.ownership ? 'Direct' : 'None',
      emphasis: listing.rights.ownership ? 'none' : 'warn',
    },
    {
      label: 'Backing',
      // The full sentence lives below the table; here it is the one-word answer.
      value: isPerp ? 'No shares held' : 'Shares in segregated custody',
      emphasis: isPerp ? 'warn' : 'none',
    },
    {
      label: 'Redeemable',
      value: listing.redemption?.available ? 'Yes, with the issuer' : 'No',
      emphasis: listing.redemption?.available ? 'none' : 'warn',
    },
    { label: 'Dividends', value: listing.rights.dividends ? 'Reinvested' : 'None' },
    { label: 'Voting rights', value: listing.rights.voting ? 'Yes' : 'None' },
    {
      label: 'Leverage',
      value: listing.maxLeverage > 1 ? `Up to ${formatLeverage(listing.maxLeverage)}` : 'None',
      emphasis: listing.maxLeverage > 1 ? 'warn' : 'none',
    },
    { label: 'Issuer', value: listing.issuer ?? 'None — venue-deployed contract' },
  ];
}

export function ProductStructure({ view }: { view: AssetView }) {
  return (
    <div className="mr-structure-grid">
      {view.listings.map(({ listing }) => (
        <section key={listing.id} className="mr-structure">
          <header className="mr-structure-head">
            <VenueBadge venue={listing.venue} />
          </header>

          <dl className="mr-structure-rows">
            {rowsFor(listing).map((row) => (
              <div key={row.label} className="mr-structure-row">
                <dt>{row.label}</dt>
                <dd className={row.emphasis === 'warn' ? 'mr-structure-warn' : undefined}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

/**
 * The one risk that cannot be left implicit.
 *
 * A reader who skims this page should not be able to come away thinking a
 * perpetual gives them a share. Colour alone is not enough — the heading says
 * it, the body explains it, and the detail is expandable rather than hidden,
 * so a beginner gets the plain answer and anyone who wants the mechanism can
 * open it.
 */
export function RiskCallout({ view }: { view: AssetView }) {
  const synthetic = view.listings.find(({ listing }) => listing.kind === 'perpetual');
  if (!synthetic) return null;

  const { listing } = synthetic;

  return (
    <aside className="mr-risk" role="note">
      <p className="mr-risk-head">
        <span aria-hidden="true">⚠</span> This is synthetic exposure, not ownership
      </p>
      <p className="mr-risk-body">
        The {view.asset.symbol} perpetual on {listing.venue} settles in USDC against an oracle
        price. No {view.asset.name} shares are held on your behalf, and the position can be
        liquidated.
      </p>

      <details className="mr-risk-more">
        <summary>Why does this matter?</summary>
        <div className="mr-risk-detail">
          <p>
            A share is a claim on a company. A perpetual is a contract whose value tracks that
            share&rsquo;s price — so you gain and lose the same amount, but you own nothing. That
            difference only becomes visible in the situations that matter most:
          </p>
          <ul>
            <li>
              <strong>Dividends and corporate actions</strong> do not reach you; the contract only
              follows price.
            </li>
            <li>
              <strong>Leverage cuts both ways.</strong> At {formatLeverage(listing.maxLeverage)} a
              move against you of a few percent can close the position at a loss.
            </li>
            <li>
              <strong>You depend on the oracle and the venue.</strong> If either fails, your
              exposure is affected even when the underlying share is fine.
            </li>
          </ul>
          {view.listings.length > 1 && (
            <p>
              The other venue below lists this as a collateral-backed instrument instead. Compare
              both before choosing.
            </p>
          )}
        </div>
      </details>
    </aside>
  );
}
