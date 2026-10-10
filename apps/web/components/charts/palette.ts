/**
 * The data palette: eight hues from `--mr-data-1…8`, for categories and chart
 * series. Colour here is data — the one place the product is colourful — and
 * is never the only key: every chart also has labels and a table.
 */

export const DATA_HUES = 8;

/** The CSS colour for series `i` (0-based), cycling through the palette. */
export const dataColor = (i: number) =>
  `var(--mr-data-${(((i % DATA_HUES) + DATA_HUES) % DATA_HUES) + 1})`;

/** A stable index for a name, so a category keeps its colour across pages. */
export function hueIndex(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % DATA_HUES;
}

export const colorFor = (key: string) => dataColor(hueIndex(key));

/** A short deterministic id for SVG gradients and clip paths, safe to render on the server. */
export function svgId(prefix: string, seed: string): string {
  return `${prefix}-${hueIndexWide(seed).toString(36)}`;
}

function hueIndexWide(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
