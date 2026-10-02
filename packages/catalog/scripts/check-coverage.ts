/**
 * Catalog coverage check — runs in CI.
 *
 * Fails the build when the live venue carries a market the catalog does not
 * know about. This is the guard against exactly the failure that rotted the
 * reference: it shipped 62 markets while the venue had grown to 129, and
 * nothing told anyone.
 *
 * A venue being unreachable is NOT a failure here — this checks data drift, not
 * uptime. CI should not go red because an upstream API had a bad minute.
 */

import { knownVenueSymbols } from '../src/index';

const API = process.env.NEXT_PUBLIC_HYPERLIQUID_API_URL ?? 'https://api.hyperliquid.xyz';
const DEX = process.env.NEXT_PUBLIC_HYPERLIQUID_DEX ?? 'xyz';

interface UniverseEntry {
  name: string;
  isDelisted?: boolean;
}

async function main(): Promise<void> {
  const known = new Set(knownVenueSymbols('hyperliquid').map((s) => s.toUpperCase()));
  console.log(`catalog knows ${known.size} Hyperliquid symbols`);

  let universe: UniverseEntry[];
  try {
    const response = await fetch(`${API}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'meta', dex: DEX }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { universe?: UniverseEntry[] };
    universe = payload.universe ?? [];
  } catch (error) {
    console.warn(`⚠ Could not reach ${API} — skipping coverage check.`);
    console.warn(`  ${error instanceof Error ? error.message : String(error)}`);
    return; // Not a failure: upstream availability is not our invariant.
  }

  const live = universe
    .filter((entry) => !entry.isDelisted)
    .map((entry) => {
      const separator = entry.name.indexOf(':');
      return (separator === -1 ? entry.name : entry.name.slice(separator + 1)).toUpperCase();
    });

  const missing = live.filter((symbol) => !known.has(symbol));

  console.log(`venue lists ${live.length} live markets`);

  if (missing.length > 0) {
    console.error(`\n✖ ${missing.length} live market(s) missing from the catalog:\n`);
    console.error(`  ${missing.join(' ')}\n`);
    console.error('Add an entry under packages/catalog/src/assets/<id>.ts for each,');
    console.error(
      'then add it to assets/index.ts. One file per asset — no shared file to conflict on.\n',
    );
    process.exit(1);
  }

  const coverage = ((live.length / Math.max(live.length, 1)) * 100).toFixed(0);
  console.log(`✓ catalog covers all ${live.length} live markets (${coverage}%)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
