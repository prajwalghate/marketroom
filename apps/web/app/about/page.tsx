import {
  DISPLAY_PASS,
  DISPLAY_WARN,
  DEAD_POOL_USD,
  formatNotional,
  formatThreshold,
  NO_PRICE_SPREAD,
  PROBE_SIZES_USD,
  REFERENCE_NOTIONAL_USD,
  REFERENCE_PASS,
  REFERENCE_WARN,
  SMALL_TICKET_USD,
  THIN_SLIPPAGE,
  TRADABLE_SLIPPAGE,
  type Verdict,
} from '@marketroom/core';
import { SectionTitle } from '@marketroom/ui';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { VerdictBadge } from '@/components/trust/TrustBits';

export const metadata: Metadata = {
  title: 'Method',
  description:
    'How the Marketroom trust check measures what a real order would fill at, and what it can and cannot tell you.',
};

/**
 * Methodology.
 *
 * A trust check that does not publish its method is asking to be trusted
 * rather than checked. Every threshold on this page is rendered from the same
 * constant the verdict code reads, so the page cannot drift from the product:
 * change a cut-off in `core` and this page changes with it.
 */

const pct = (fraction: number) => formatThreshold(fraction);
const ladder = PROBE_SIZES_USD.map(formatNotional).join(', ');

const VERDICTS: { verdict: Verdict; rule: ReactNode }[] = [
  {
    verdict: 'tradable',
    rule: (
      <>
        A {formatNotional(REFERENCE_NOTIONAL_USD)} order fills within {pct(TRADABLE_SLIPPAGE)} of
        the market&rsquo;s own executable mid, on both sides.
      </>
    ),
  },
  {
    verdict: 'thin',
    rule: (
      <>
        A {formatNotional(SMALL_TICKET_USD)} order fills within {pct(THIN_SLIPPAGE)}, but{' '}
        {formatNotional(REFERENCE_NOTIONAL_USD)} does not.
      </>
    ),
  },
  {
    verdict: 'quote-only',
    rule: (
      <>
        A price is displayed, but even small trades land far from it: the smallest buy and sell fill
        more than {pct(NO_PRICE_SPREAD)} apart, or a {formatNotional(SMALL_TICKET_USD)} order lands
        more than {pct(THIN_SLIPPAGE)} away.
      </>
    ),
  },
  {
    verdict: 'no-market',
    rule: (
      <>
        No route and no resting orders at any size — or a pool holding less than{' '}
        {formatNotional(DEAD_POOL_USD)}, which is conclusive without a probe.
      </>
    ),
  },
  {
    verdict: 'unmeasured',
    rule: (
      <>
        The measurement itself failed — a timeout or a rate limit. We say so rather than guess. A
        failed request is never read as an empty market.
      </>
    ),
  },
];

export default function AboutPage() {
  return (
    <div className="mr-container">
      <h1
        style={{
          margin: '0 0 8px',
          fontSize: 'var(--mr-text-2xl)',
          fontWeight: 600,
          letterSpacing: '-0.02em',
        }}
      >
        How the trust check works
      </h1>
      <p
        style={{
          color: 'var(--mr-text-muted)',
          margin: '0 0 32px',
          lineHeight: 1.65,
          maxWidth: '72ch',
        }}
      >
        Every price on a screen is somebody&rsquo;s last number. Marketroom measures what a real
        order would actually fill at, on every venue, and publishes the receipts. Here is exactly
        what is measured, how the verdicts are decided, and what none of it can tell you.
      </p>

      <Block title="What we measure" id="method">
        <p>
          Every listing is probed with real order sizes — {ladder} — on both sides. Nothing is
          estimated from volume or pool size; a pool&rsquo;s total value says how much is in it, not
          what a trade would cost, and in our measurements the two disagreed by a factor of five.
        </p>
        <ul>
          <li>
            <strong>Perpetuals on Hyperliquid</strong>: we walk the venue&rsquo;s live order book
            level by level. When the full-precision book runs out, we walk a price-aggregated one
            and price each bucket at its far edge, which overstates the cost slightly and never
            understates it.
          </li>
          <li>
            <strong>Tokens on Solana</strong>: we ask Jupiter for a routed swap quote at each size,
            USDC in and out, with pool fees included. xStocks scale balances on-chain for splits and
            dividends — one NFLXx unit displays as ten after the 10-for-1 split — so every fill is
            converted with the mint&rsquo;s own multiplier, read from the chain.
          </li>
        </ul>
        <p>
          The index measures {formatNotional(SMALL_TICKET_USD)} and{' '}
          {formatNotional(REFERENCE_NOTIONAL_USD)} every five minutes; a market page measures the
          full ladder for the asset you are reading. Every figure shows when it was measured.
        </p>
      </Block>

      <Block title="The verdict">
        <p>
          One word per listing, decided by depth alone and stated against the market&rsquo;s{' '}
          <em>executable mid</em> — the midpoint of the smallest buy and sell that both filled —
          rather than the displayed price. A displayed price can lag the market it describes, and a
          verdict built on it would condemn a deep market for a stale label.
        </p>
        <dl className="mr-method-verdicts">
          {VERDICTS.map(({ verdict, rule }) => (
            <div key={verdict}>
              <dt>
                <VerdictBadge verdict={verdict} size="md" />
              </dt>
              <dd>{rule}</dd>
            </div>
          ))}
        </dl>
      </Block>

      <Block title="The four checks">
        <p>
          Beside the verdict, four questions are answered separately rather than folded into a score
          — &ldquo;deep market, stale label&rdquo; and &ldquo;dead market, fresh label&rdquo; are
          different problems, and one number would hide which one you have.
        </p>
        <ul>
          <li>
            <strong>Can it take a real order?</strong> The fills above, and the largest trade that
            stays within {pct(TRADABLE_SLIPPAGE)}, interpolated between measured sizes on a log
            scale and labelled as an estimate.
          </li>
          <li>
            <strong>Is the shown price where it trades?</strong> The displayed price against the
            executable mid: within {pct(DISPLAY_PASS)} passes, within {pct(DISPLAY_WARN)} warns.
          </li>
          <li>
            <strong>Does it track the actual stock?</strong> The executable mid against the
            trade[XYZ] oracle: within {pct(REFERENCE_PASS)} passes, within {pct(REFERENCE_WARN)}{' '}
            warns. That oracle prices US stocks from outside venues 24 hours a day, five days a week
            — from 8 PM ET on Sunday to 8 PM ET on Friday. On weekends and US holidays it follows
            the perpetual&rsquo;s own order book through a 30-minute average, so in those hours we
            do not check the perpetual against it: that would be checking it against itself.
          </li>
          <li>
            <strong>Is anyone trading it?</strong> Trade counts for tokens; the time of the last
            trade for perpetuals.
          </li>
        </ul>
      </Block>

      <Block title="Gaps on screen, and gaps you can trade">
        <p>
          When an asset trades on two venues, the gap between their displayed prices is the number
          most screens headline. We price the trade it suggests: buy{' '}
          {formatNotional(REFERENCE_NOTIONAL_USD)} where it looks cheap, sell where it looks dear,
          both at measured fills. The result is stated before fees and funding. The widest gaps on
          screen are routinely the ones that cannot be executed at all — they come from pools too
          thin to trade against, where the last print is the stalest.
        </p>
      </Block>

      <Block title="What you actually own">
        <p>
          A <strong>perpetual</strong> on Hyperliquid is a synthetic contract that settles in USDC
          against an oracle. No share is held for you, the position can be liquidated, and the
          market&rsquo;s deployer can halt trading — which cancels every order and settles every
          position at the current mark price.
        </p>
        <p>
          An <strong>xStock</strong> on Solana is a tracker certificate under Swiss law, issued by
          Backed Assets (JE) Limited and backed by shares held with custodians and brokers. It
          carries no shareholder rights. Redemption with the issuer is for cash at the market price,
          after KYC, with a $5,000 minimum — not for the share itself. And the issuer holds live
          keys on every one of the 41 xStock mints we track: it can freeze a wallet, pause all
          transfers, and move or burn tokens in any account through a permanent delegate. We read
          those keys from the chain rather than from the documents, because they are broader than
          the uses the documents describe.
        </p>
        <p>
          Every market page links to the issuer&rsquo;s terms, its published proof of reserves, and
          the mint on an explorer, so you can check backing, rights and redemption yourself.
        </p>
      </Block>

      <Block title="What this cannot tell you">
        <ul>
          <li>
            Whether an issuer is solvent, or whether its reserve figures are accurate. Those are
            published by the issuer; we link to them, and do not audit them.
          </li>
          <li>
            Depth beyond what a venue shows. Hyperliquid publishes twenty levels a side; liquidity
            that is not posted cannot be measured.
          </li>
          <li>
            The future. A fill measured five minutes ago is evidence about now, not a quote — and on
            a thin market, the next trade can move it.
          </li>
          <li>Fees, funding and gas. Measured fills include pool fees; nothing else is netted.</li>
        </ul>
      </Block>

      <Block title="Open data">
        <p>
          Everything on Marketroom is published as JSON — projects, funding rounds, the search index
          and the trust check — documented on the{' '}
          <a href="/api-docs" className="mr-trust-link">
            API page
          </a>
          . The trust measurements specifically:{' '}
          <a href="/api/trust" className="mr-trust-link">
            /api/trust
          </a>{' '}
          for every listing, and <code>/api/trust/&#123;asset&#125;</code> for one asset with every
          fill. Wallets and aggregators are welcome to show a warning before their users trade a
          price that is not real.
        </p>
      </Block>

      <Block title="Not advice">
        <p>
          Nothing here is financial advice. Marketroom is not affiliated with Hyperliquid,
          trade[XYZ], Backed, Kraken, Jupiter or any issuer. Verify every figure at its source
          before acting on it.
        </p>
      </Block>
    </div>
  );
}

function Block({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 30, scrollMarginTop: 80 }}>
      <SectionTitle>{title}</SectionTitle>
      {/* Capped measure: long lines of prose are hard to track back from, and
          this page is the one place in the product that is mostly reading. */}
      <div className="mr-method-prose">{children}</div>
    </section>
  );
}
