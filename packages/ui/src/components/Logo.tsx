/**
 * The Marketroom mark.
 *
 * The product's whole idea is that one underlying can exist as two different
 * instruments. The mark says that: two bars of the same height, from the same
 * baseline, rendered differently — one solid, one outlined. Same asset, two
 * forms, the difference visible in how they are drawn rather than in what
 * they measure.
 *
 * Deliberately not: a coin, a globe, an upward arrow, a gradient, or a letter
 * in a box. The first four are crypto-dashboard furniture and the last is what
 * this replaces — a placeholder that reads as one.
 *
 * Monochrome and `currentColor` throughout, so it inherits the surrounding
 * text colour and needs no variant per theme. Geometry holds at 16px: two
 * shapes, one stroke weight, no detail that disappears when small.
 */
export function Logo({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 26 26"
      fill="none"
      className={className}
      // Decorative: the wordmark beside it already names the product, and the
      // link that wraps both carries its own label.
      aria-hidden="true"
      focusable="false"
    >
      {/* Outlined bar — a claim you hold: it has an edge, something inside. */}
      <rect
        x="3.1"
        y="6.1"
        width="7.8"
        height="13.8"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      {/* Solid bar — synthetic exposure: the same shape, filled in, nothing
          held. Offset slightly higher so the pair reads as two states of one
          thing rather than a symmetric logo. */}
      <rect x="15.1" y="3.2" width="7.8" height="13.8" rx="1.6" fill="currentColor" />
    </svg>
  );
}
