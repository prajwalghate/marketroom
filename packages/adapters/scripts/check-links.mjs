/**
 * Verify every outbound link the app renders actually resolves.
 *
 * This exists because it didn't, and three shipped broken: the "Trade" button
 * on every Hyperliquid market 404'd — the venue selects markets by query
 * parameter, not by path — and two issuer documentation links pointed at pages
 * that had never existed.
 *
 * A dead "Trade" button is worse than a missing one. It is the single action
 * this product exists to hand off to, and nothing in a typecheck, a lint or a
 * unit test can tell you a URL is wrong. Only asking the internet can.
 *
 * Run: pnpm links:check
 * Unreachable hosts are reported but do not fail the run; a 404 does.
 */

const UA = 'Mozilla/5.0 (compatible; MarketroomLinkCheck/1.0)';
const TIMEOUT_MS = 20_000;

/** Hosts that block automated requests. A 403 from these is not a dead link. */
const BOT_PROTECTED = new Set(['solscan.io', 'www.solscan.io']);

const NVDA_MINT = 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh';

/** One representative URL per template the adapters can emit. */
const LINKS = [
  ['hyperliquid trade (templated)', 'https://app.trade.xyz/?market=NVDA'],
  ['hyperliquid venue', 'https://app.trade.xyz'],
  ['trade[XYZ] docs', 'https://docs.trade.xyz'],
  ['hyperliquid docs', 'https://hyperliquid.gitbook.io/hyperliquid-docs'],
  ['solana trade (templated)', `https://jup.ag/swap/USDC-${NVDA_MINT}`],
  ['xstocks docs', 'https://docs.xstocks.fi/docs'],
  ['xstocks legal overview', 'https://docs.xstocks.fi/docs/product-legal-overview'],
  ['xstocks issuance & redemption', 'https://docs.xstocks.fi/docs/issuance-and-redemption'],
  ['backed prospectus', 'https://assets.backed.fi/legal-documentation'],
  ['xstocks redemption terms', 'https://docs.xstocks.fi/docs/issuance-and-redemption/market-flow'],
  ['xstocks proof of reserves', 'https://defi.xstocks.fi/proof-of-reserves'],
  ['trade[XYZ] oracle methodology', 'https://docs.trade.xyz/perpetuals/mechanics/oracle-price'],
  ['solscan mint (templated)', `https://solscan.io/token/${NVDA_MINT}`],
];

let failed = 0;
let skipped = 0;

for (const [label, url] of LINKS) {
  let status = 0;
  let note = '';

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = res.status;
  } catch (error) {
    note = error instanceof Error ? error.message : String(error);
  }

  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    host = '';
  }

  const ok = status >= 200 && status < 400;
  const tolerated = status === 403 && BOT_PROTECTED.has(host);

  if (ok) {
    console.log(`  ✓ ${status}  ${label}`);
  } else if (tolerated) {
    skipped += 1;
    console.log(`  ~ ${status}  ${label} (host blocks automated requests)`);
  } else if (status === 0) {
    skipped += 1;
    console.warn(`  ~ ---  ${label} — unreachable: ${note}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${status}  ${label}\n        ${url}`);
  }
}

console.log(`\n${LINKS.length} links · ${failed} broken · ${skipped} unverified`);

if (failed > 0) {
  console.error('\nA broken outbound link ships a dead button. Fix the URL or remove the link.');
  process.exit(1);
}
