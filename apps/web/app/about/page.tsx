import { SectionTitle } from '@marketroom/ui';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Method',
  description: 'Where Marketroom data comes from, and what it does and does not claim.',
};

/**
 * Methodology.
 *
 * The reference's honest caveats section was one of the better things about it,
 * and the instinct is worth carrying forward: state where numbers come from,
 * and say plainly when something is not known.
 */
export default function AboutPage() {
  return (
    /* Standard container, with the measure capped on the prose itself. The old
       `maxWidth: 820` shrank the container, and because it still centres, this
       page's content started 250px right of the header and footer — the only
       route in the app that did not line up with its own chrome. */
    <div className="mr-container">
      <h1
        style={{
          margin: '0 0 8px',
          fontSize: 'var(--mr-text-2xl)',
          fontWeight: 600,
          letterSpacing: '-0.02em',
        }}
      >
        Method &amp; caveats
      </h1>
      <p
        style={{
          color: 'var(--mr-text-muted)',
          margin: '0 0 32px',
          lineHeight: 1.65,
          maxWidth: '72ch',
        }}
      >
        Marketroom indexes tokenized equities across chains. Here is exactly where every number
        comes from, and what it does not mean.
      </p>

      <Block title="Where the data comes from">
        <p>
          Prices, volume, open interest and funding come live from the{' '}
          <strong>Hyperliquid info API</strong> for HIP-3 markets deployed by trade[XYZ], and from{' '}
          <strong>Jupiter</strong> for Solana xStocks. Both are public, unauthenticated endpoints.
          Nothing on this site is hand-entered or frozen.
        </p>
        <p>
          Company identity, sector, country and the written summaries are curated by us and version
          controlled in the repository. No market data API provides them.
        </p>
      </Block>

      <Block title="These are not shares">
        <p>
          A <strong>perpetual future</strong> on Hyperliquid tracks a stock&apos;s oracle price. It
          gives leveraged price exposure and nothing else — no ownership, no dividends, no votes,
          and it can be liquidated.
        </p>
        <p>
          A <strong>tokenized equity</strong> on Solana is a custody-backed token: an issuer holds
          the real share and the token is a redeemable claim on it, subject to their terms and your
          eligibility.
        </p>
        <p>
          These are different products that happen to share a ticker. Every price on this site is
          labelled with which one it is, because conflating them is the single most expensive
          mistake a user of this data could make.
        </p>
      </Block>

      <Block title="What we don't claim">
        <p>
          P/E ratios are <strong>indicative</strong>, reflecting public trailing figures that move
          daily. Treat them as a rough valuation band, not a quote.
        </p>
        <p>
          Where a figure genuinely does not exist, we show <strong>N/A</strong> rather than invent
          one. Private and pre-IPO companies, preferred structures and loss-making companies have no
          meaningful P/E, so none is shown.
        </p>
        <p>
          Venues report different metrics. A perp has open interest and funding; a token has pool
          liquidity and holder counts. We show what each venue actually publishes instead of padding
          both into the same columns.
        </p>
      </Block>

      <Block title="Cross-venue spreads">
        <p>
          Where an asset trades on more than one venue, we show the price difference. A gap is
          normal — these are structurally different instruments with different costs of carry,
          liquidity and redemption mechanics. A persistent or unusually wide gap is worth
          understanding before acting on it.
        </p>
      </Block>

      <Block title="Not advice">
        <p>
          Nothing here is financial advice. Marketroom is not affiliated with Hyperliquid,
          trade[XYZ], Backed Finance, Jupiter or any issuer. Verify every figure at its source
          before acting on it.
        </p>
      </Block>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 30 }}>
      <SectionTitle>{title}</SectionTitle>
      {/* Capped measure: long lines of prose are hard to track back from, and
          this page is the one place in the product that is mostly reading. */}
      <div
        style={{
          fontSize: 'var(--mr-text-base)',
          lineHeight: 1.7,
          color: 'var(--mr-text-muted)',
          maxWidth: '72ch',
        }}
      >
        {children}
      </div>
    </section>
  );
}
