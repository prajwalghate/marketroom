/* eslint-disable no-console */
/* global console, process -- the workspace eslint config declares no Node globals, and
   its `scripts/**` override only covers .ts files. */
/**
 * WCAG 2.1 contrast gate for the token contract.
 *
 *     pnpm --filter @marketroom/ui contrast
 *
 * Parses `src/tokens.css`, resolves every token (compositing translucent fills
 * and borders onto the backdrop they are actually seen against), and measures
 * the ratio for every foreground/background pair that occurs in the product, in
 * both themes. Exits non-zero if any gated pair fails, so it can run in CI.
 *
 * Why a script and not a spot-check in devtools: "looks fine" is how
 * `--mr-text-subtle` shipped at 3.13:1 on `--mr-surface-3`, and how
 * `--mr-down` on its own `-soft` fill shipped at 4.40:1 — a pair nobody thinks
 * to check, because each half of it passes on its own.
 *
 * Gates
 *   body    4.5:1  all text and all numerics. Our smallest numeric is 11px
 *                  (--mr-text-2xs), so nothing here earns WCAG's 3:1 "large
 *                  text" allowance.
 *   nontext 3.0:1  non-text that carries meaning or state: the focus ring, the
 *                  pressed-control border, venue dots, sparkline strokes.
 *   info     —     reported, not gated. Decorative hairlines are exempt under
 *                  WCAG 1.4.11 and are deliberately low-contrast; that is what
 *                  makes the chrome recede. Printed so a regression is visible.
 *
 * To add a pair, append to CASES. Keep `where` honest — it is the only record
 * of why the pair exists.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKENS = resolve(dirname(fileURLToPath(import.meta.url)), '../src/tokens.css');

// ── parsing ────────────────────────────────────────────────────────────────

/** Body of the first rule matching `selector`, brace-balanced. */
function block(css, selector) {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`selector not found in tokens.css: ${selector}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced braces after ${selector}`);
}

function declarations(body) {
  const out = {};
  // Strip comments first, or a `--token:` written inside one gets parsed.
  for (const match of body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out[match[1]] = match[2].trim();
  }
  return out;
}

const css = readFileSync(TOKENS, 'utf8');
const DARK = declarations(block(css, ':root'));
// Light inherits everything it does not override, exactly as the cascade does.
const LIGHT = { ...DARK, ...declarations(block(css, "[data-theme='light']")) };

// ── colour maths ───────────────────────────────────────────────────────────

const hex = (value) => {
  const raw = value.replace('#', '').trim();
  const full = raw.length === 3 ? [...raw].map((c) => c + c).join('') : raw;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};

/** `{ rgb, a }`. `a < 1` means the value has to be composited before measuring. */
function parse(value, theme) {
  const text = String(value).trim();

  const variable = text.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/i);
  if (variable) return parse(theme[variable[1]], theme);

  if (text.startsWith('#')) return { rgb: hex(text), a: 1 };

  const functional = text.match(/^rgba?\(([^)]+)\)$/i);
  if (functional) {
    const parts = functional[1]
      .split(/[,\s/]+/)
      .filter(Boolean)
      .map(Number);
    return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
  }

  throw new Error(`unparseable colour: ${value}`);
}

const composite = (fg, backdrop) =>
  fg.a >= 1 ? fg.rgb : fg.rgb.map((c, i) => Math.round(c * fg.a + backdrop[i] * (1 - fg.a)));

const relativeLuminance = ([r, g, b]) => {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a, b) => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Measure `fg` against `bg`, optionally with a translucent `fill` layered in between. */
function measure(theme, { fg, bg, fill }) {
  let backdrop = parse(theme[bg], theme).rgb;
  if (fill) backdrop = composite(parse(theme[fill], theme), backdrop);
  return contrast(composite(parse(theme[fg], theme), backdrop), backdrop);
}

// ── the pairs that occur in practice ───────────────────────────────────────

const SURFACES = ['--mr-bg', '--mr-surface-1', '--mr-surface-2', '--mr-surface-3'];
const SEMANTIC = ['--mr-up', '--mr-down', '--mr-flat', '--mr-accent', '--mr-warn'];

const CASES = [];

// Text ramp on every surface it can legally sit on. `--mr-surface-raised` is
// excluded by contract: popovers and tooltips use --mr-text / --mr-text-muted.
for (const fg of ['--mr-text', '--mr-text-muted', '--mr-text-subtle'])
  for (const bg of SURFACES) CASES.push({ fg, bg, kind: 'body', where: 'text ramp' });

// Direction and status colours. surface-2 is included because the order book's
// spread row and the sector bar track both sit on it.
for (const fg of SEMANTIC)
  for (const bg of ['--mr-bg', '--mr-surface-1', '--mr-surface-2'])
    CASES.push({ fg, bg, kind: 'body', where: 'numeric 11-18px' });

CASES.push(
  // A tinted chip: the text sits on its own soft fill, not on the bare card.
  {
    fg: '--mr-up',
    bg: '--mr-surface-1',
    fill: '--mr-up-soft',
    kind: 'body',
    where: 'Badge tone=up',
  },
  {
    fg: '--mr-down',
    bg: '--mr-surface-1',
    fill: '--mr-down-soft',
    kind: 'body',
    where: 'Badge tone=down',
  },
  {
    fg: '--mr-warn',
    bg: '--mr-surface-1',
    fill: '--mr-warn-soft',
    kind: 'body',
    where: 'Badge tone=warn',
  },
  {
    fg: '--mr-accent',
    bg: '--mr-surface-1',
    fill: '--mr-accent-muted',
    kind: 'body',
    where: 'Badge tone=accent',
  },
  { fg: '--mr-text-muted', bg: '--mr-surface-3', kind: 'body', where: 'Badge tone=neutral' },
  {
    fg: '--mr-up',
    bg: '--mr-surface-1',
    fill: '--mr-up-soft',
    kind: 'body',
    where: 'order-book bid row',
  },
  {
    fg: '--mr-down',
    bg: '--mr-surface-1',
    fill: '--mr-down-soft',
    kind: 'body',
    where: 'order-book ask row',
  },
  { fg: '--mr-text-inverse', bg: '--mr-accent', kind: 'body', where: 'primary button hover' },
  { fg: '--mr-text', bg: '--mr-surface-raised', kind: 'body', where: 'tooltip / skip link' },
  { fg: '--mr-text-muted', bg: '--mr-surface-raised', kind: 'body', where: 'tooltip secondary' },

  // Meaningful non-text.
  { fg: '--mr-accent', bg: '--mr-bg', kind: 'nontext', where: 'focus ring on page' },
  { fg: '--mr-accent', bg: '--mr-surface-1', kind: 'nontext', where: 'focus ring on card' },
  { fg: '--mr-accent', bg: '--mr-surface-3', kind: 'nontext', where: 'focus ring on control' },
  {
    fg: '--mr-accent-border',
    bg: '--mr-surface-2',
    kind: 'nontext',
    where: 'pressed chip / focused input border',
  },
  { fg: '--mr-venue-hyperliquid', bg: '--mr-surface-1', kind: 'nontext', where: 'venue dot' },
  { fg: '--mr-venue-solana', bg: '--mr-surface-1', kind: 'nontext', where: 'venue dot' },
  { fg: '--mr-up', bg: '--mr-surface-1', kind: 'nontext', where: 'sparkline / sector bar' },
  { fg: '--mr-down', bg: '--mr-surface-1', kind: 'nontext', where: 'sparkline / sector bar' },
  { fg: '--mr-flat', bg: '--mr-surface-1', kind: 'nontext', where: 'sparkline' },

  // Reported, not gated.
  { fg: '--mr-border', bg: '--mr-bg', kind: 'info', where: 'hairline on page' },
  { fg: '--mr-border', bg: '--mr-surface-1', kind: 'info', where: 'card hairline' },
  {
    fg: '--mr-border-strong',
    bg: '--mr-surface-2',
    kind: 'info',
    where: 'hover border / scrollbar',
  },
  { fg: '--mr-border-subtle', bg: '--mr-surface-1', kind: 'info', where: 'table row separator' },
  { fg: '--mr-up-border', bg: '--mr-surface-1', kind: 'info', where: 'Badge tone=up border' },
  { fg: '--mr-down-border', bg: '--mr-surface-1', kind: 'info', where: 'Badge tone=down border' },
);

const GATE = { body: 4.5, nontext: 3, info: 0 };

function report(name, theme) {
  const pad = (value, width) => String(value).padEnd(width);
  const rows = CASES.map((entry) => {
    const ratio = measure(theme, entry);
    const gate = GATE[entry.kind];
    return { ...entry, ratio, gate, pass: ratio >= gate };
  });

  console.log(`\n${'='.repeat(100)}\n  ${name}\n${'='.repeat(100)}`);
  console.log(
    pad('foreground', 24) +
      pad('background', 34) +
      pad('ratio', 9) +
      pad('gate', 7) +
      pad('', 6) +
      'role',
  );
  console.log('-'.repeat(100));
  for (const row of rows) {
    console.log(
      pad(row.fg, 24) +
        pad(row.fill ? `${row.fill} / ${row.bg}` : row.bg, 34) +
        pad(`${row.ratio.toFixed(2)}:1`, 9) +
        pad(row.gate ? row.gate.toFixed(1) : '—', 7) +
        pad(row.gate === 0 ? '  · ' : row.pass ? ' ok ' : 'FAIL', 6) +
        row.where,
    );
  }

  const failures = rows.filter((row) => row.gate > 0 && !row.pass);
  console.log('-'.repeat(100));
  console.log(failures.length ? `  ${failures.length} FAILING` : '  all gated pairs pass');
  return failures.length;
}

const failed = report('DARK  (:root)', DARK) + report("LIGHT ([data-theme='light'])", LIGHT);
if (failed > 0) {
  console.error(`\n${failed} pair(s) below the gate. Adjust the token, not the gate.\n`);
  process.exit(1);
}
console.log('');
