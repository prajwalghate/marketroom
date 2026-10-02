/**
 * One-shot generator that produced the initial `src/assets/*.ts` files.
 *
 * It merges the reference's 62 editorial entries (extracted during research,
 * see docs/research/reference-dataset.json) with the curated metadata for the
 * 67 markets the reference never covered.
 *
 * ⚠️ The generated files are the source of truth from here on. Re-running this
 * would overwrite hand edits, so it is deliberately not wired into any npm
 * script — run it explicitly with `npx tsx scripts/generate.ts` only when
 * bulk-seeding.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COUNTRY_MAP, EXTRA, PEERS, SYMBOL_FIXES, TAXONOMY_MAP, type Curated } from './curated';

const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(here, '..', 'src', 'assets');
const referencePath = join(here, '..', '..', '..', 'docs', 'research', 'reference-dataset.json');

interface ReferenceRow {
  tk: string;
  name: string;
  country: string;
  sector: string;
  pe: number | null;
  type: string;
  lev: number;
  sum: string;
}

/** Solana xStocks mints, verified against Jupiter. Keyed by canonical asset id. */
const SOLANA_MINTS: Record<string, { mint: string; issuer: string }> = {
  nvda: { mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', issuer: 'Backed Finance' },
};

const idFor = (symbol: string) => symbol.toLowerCase().replace(/[^a-z0-9]/g, '');

function toEntry(row: ReferenceRow): Curated {
  const symbol = SYMBOL_FIXES[row.tk] ?? row.tk;
  const taxonomy = TAXONOMY_MAP[row.sector] ?? { sector: 'Other', industry: row.sector };
  return {
    symbol,
    name: row.name,
    assetClass: 'equity',
    sector: taxonomy.sector,
    industry: taxonomy.industry,
    country: COUNTRY_MAP[row.country] ?? null,
    pe: row.pe,
    isPrivate: row.pe === null && /SpaceX|Quantinuum|MiniMax|Zhipu|Kioxia|Cerebras/i.test(row.name),
    summary: row.sum,
  };
}

const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function render(entry: Curated): string {
  const id = idFor(entry.symbol);
  const peers = entry.peers ?? PEERS[id] ?? [];
  const solana = SOLANA_MINTS[id];

  const lines = [
    `import { defineAsset } from '../types';`,
    ``,
    `export default defineAsset({`,
    `  id: '${id}',`,
    `  symbol: '${entry.symbol}',`,
    `  name: '${escape(entry.name)}',`,
    `  assetClass: '${entry.assetClass}',`,
    `  taxonomy: { sector: '${escape(entry.sector)}', industry: '${escape(entry.industry)}' },`,
    `  country: ${entry.country ? `'${entry.country}'` : 'null'},`,
    `  peRatio: ${entry.pe ?? 'null'},`,
    `  isPrivate: ${entry.isPrivate ? 'true' : 'false'},`,
    `  peers: [${peers.map((p) => `'${p}'`).join(', ')}],`,
    `  summary:`,
    `    '${escape(entry.summary ?? '')}',`,
    `  hyperliquid: ['${entry.hl ?? entry.symbol}'],`,
  ];

  if (solana) {
    lines.push(`  solana: [{ mint: '${solana.mint}', issuer: '${solana.issuer}' }],`);
  }

  lines.push(`});`, ``);
  return lines.join('\n');
}

const reference: ReferenceRow[] = JSON.parse(readFileSync(referencePath, 'utf8'));
const entries = [...reference.map(toEntry), ...EXTRA];

mkdirSync(assetsDir, { recursive: true });

const seen = new Set<string>();
const ids: string[] = [];

for (const entry of entries) {
  const id = idFor(entry.symbol);
  if (seen.has(id)) {
    console.warn(`duplicate id skipped: ${id}`);
    continue;
  }
  seen.add(id);
  ids.push(id);
  writeFileSync(join(assetsDir, `${id}.ts`), render(entry), 'utf8');
}

// Barrel file. Regenerated alongside the entries so an added asset is picked up
// without anyone editing a shared list by hand.
const barrel = [
  '/**',
  ' * Generated barrel — re-run `npx tsx scripts/generate.ts` after adding an asset,',
  ' * or add the two lines by hand. Kept sorted so diffs stay minimal.',
  ' */',
  '',
  ...ids.map((id) => `import ${id === 'new' ? '_new' : id} from './${id}';`),
  '',
  'export const ASSET_ENTRIES = [',
  ...ids.map((id) => `  ${id === 'new' ? '_new' : id},`),
  '] as const;',
  '',
].join('\n');

writeFileSync(join(assetsDir, 'index.ts'), barrel, 'utf8');
console.log(`generated ${ids.length} asset files`);
