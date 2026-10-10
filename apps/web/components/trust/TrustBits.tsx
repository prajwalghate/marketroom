import type { CheckStatus, InstrumentKind, Verdict, VenueId } from '@marketroom/core';
import { VERDICT_LABEL } from '@marketroom/core';
import { VisuallyHidden } from '@marketroom/ui';

/**
 * Small, shared trust vocabulary.
 *
 * Every verdict and check status carries a glyph *and* a word. Colour is the
 * third signal, never the only one: a red/green colour-blind reader has to be
 * able to tell "Tradable" from "Quote only" at a glance, and so does anyone
 * reading a greyscale screenshot of it.
 */

const VERDICT_GLYPH: Record<Verdict, string> = {
  tradable: '✓',
  thin: '◐',
  'quote-only': '✕',
  'no-market': '⊘',
  unmeasured: '?',
};

export function VerdictBadge({
  verdict,
  size = 'md',
}: {
  verdict: Verdict;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <span className={`mr-verdict is-${verdict} is-${size}`}>
      <span aria-hidden="true" className="mr-verdict-glyph">
        {VERDICT_GLYPH[verdict]}
      </span>
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

const STATUS_GLYPH: Record<CheckStatus, string> = {
  pass: '✓',
  warn: '!',
  fail: '✕',
  unknown: '?',
};

const STATUS_WORD: Record<CheckStatus, string> = {
  pass: 'passed',
  warn: 'warning',
  fail: 'failed',
  unknown: 'not determined',
};

/** A check's outcome as a glyph, with the word for assistive tech. */
export function StatusGlyph({ status }: { status: CheckStatus }) {
  return (
    <span className={`mr-status is-${status}`}>
      <span aria-hidden="true">{STATUS_GLYPH[status]}</span>
      <VisuallyHidden>{STATUS_WORD[status]}: </VisuallyHidden>
    </span>
  );
}

export const CHECK_SHORT: Record<string, string> = {
  depth: 'Depth',
  price: 'Price',
  reference: 'Tracks stock',
  activity: 'Activity',
};

/**
 * "Hyperliquid perp", "Solana token". Lives here, not beside the chart that
 * also uses it, because the chart is a client module and a server component
 * cannot call a function exported from one.
 */
export const seriesName = (venue: VenueId, kind: InstrumentKind) =>
  `${venue === 'hyperliquid' ? 'Hyperliquid' : 'Solana'} ${kind === 'perpetual' ? 'perp' : 'token'}`;
