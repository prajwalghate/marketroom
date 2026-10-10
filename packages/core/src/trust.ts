/**
 * The trust check: is the price you see the price you would get?
 *
 * Every listing gets one verdict, stated against a real order size, and four
 * checks a reader can audit — each with the measurement behind it:
 *
 *   depth      Can it take a real order?              fills at $100 → $100k
 *   price      Is the shown price where it trades?    displayed vs executable mid
 *   reference  Does it track the actual stock?        executable mid vs oracle
 *   activity   Is anyone trading it?                  trade recency / volume
 *
 * The verdict comes from depth alone, measured against the listing's own
 * executable mid. The other checks are reported beside it rather than folded
 * into a score: "deep market, stale label" and "dead market, fresh label" are
 * different problems, and a single number would hide which one you have.
 *
 * Thresholds are constants below, published on the methodology page, and
 * deliberately round. A trust product whose cut-offs need explaining has
 * already lost the argument.
 */

import {
  displayGapAt,
  executableMid,
  fillAt,
  roundTripAt,
  sizeWithin,
  slippageAt,
  type DepthProbe,
  type ExecutableMid,
  type ProbeIndex,
  type SizeBound,
} from './fills';
import {
  formatCompactUsd,
  formatCount,
  formatNotional,
  formatNotionalShort,
  formatPercentAdaptive,
  formatPrice,
  formatRelativeTime,
  formatThreshold,
} from './format';
import { describeSession, formatNyTime, type MarketSession } from './session';
import { REFERENCE_NOTIONAL_USD, tradabilityOf } from './tradability';
import type { AssetView, InstrumentKind, ListingQuote, VenueId } from './types';

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** A tradable market fills the reference size within this of its own mid. */
export const TRADABLE_SLIPPAGE = 0.01;

/** A thin market still fills a small ticket within this. */
export const THIN_SLIPPAGE = 0.02;

/** The small ticket. */
export const SMALL_TICKET_USD = 1_000;

/**
 * If the smallest buy and sell land further apart than this, the listing has no
 * market price at all — there is a number on the screen and nothing behind it.
 */
export const NO_PRICE_SPREAD = 0.05;

/** Displayed price against the executable mid. */
export const DISPLAY_PASS = 0.005;
export const DISPLAY_WARN = 0.02;

/** Executable mid against the reference price for the underlying. */
export const REFERENCE_PASS = 0.01;
export const REFERENCE_WARN = 0.03;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Verdict = 'tradable' | 'thin' | 'quote-only' | 'no-market' | 'unmeasured';

export const VERDICT_LABEL: Readonly<Record<Verdict, string>> = {
  tradable: 'Tradable',
  thin: 'Thin',
  'quote-only': 'Quote only',
  'no-market': 'No market',
  unmeasured: 'Not measured',
};

/** Best first. `unmeasured` ranks above known-bad: unknown is not condemned. */
const VERDICT_RANK: Readonly<Record<Verdict, number>> = {
  tradable: 4,
  thin: 3,
  unmeasured: 2,
  'quote-only': 1,
  'no-market': 0,
};

export const compareVerdicts = (a: Verdict, b: Verdict) => VERDICT_RANK[b] - VERDICT_RANK[a];

export type CheckId = 'depth' | 'price' | 'reference' | 'activity';
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';

/** One line of evidence, phrased so it can be checked against its source. */
export interface Receipt {
  readonly label: string;
  readonly value: string;
}

export interface TrustCheck {
  readonly id: CheckId;
  /** The question this answers, in a reader's words. */
  readonly question: string;
  readonly status: CheckStatus;
  readonly finding: string;
  readonly receipts: readonly Receipt[];
  /** Where the evidence came from. `null` when there was nothing to measure. */
  readonly source: string | null;
}

export interface ListingTrust {
  readonly listingId: string;
  readonly venue: VenueId;
  readonly kind: InstrumentKind;
  readonly verdict: Verdict;
  /** One sentence, numbers included, that a reader could repeat to someone else. */
  readonly headline: string;
  /** A few words for a table cell. */
  readonly short: string;
  readonly displayedPrice: number | null;
  readonly mid: ExecutableMid | null;
  /** Worst-side slippage from the mid at each probe size; `null` = could not fill. */
  readonly slippage: readonly { readonly notionalUsd: number; readonly fraction: number | null }[];
  /** How far a $1k trade lands from the displayed price, worse side. */
  readonly displayGap: ReturnType<typeof displayGapAt>;
  readonly withinOnePercent: SizeBound | null;
  readonly roundTrip: number | null;
  readonly checks: readonly TrustCheck[];
  readonly measuredAt: number | null;
  readonly probe: DepthProbe | null;
}

export interface Reference {
  readonly price: number;
  /** e.g. "trade[XYZ] oracle". Shown verbatim — the reference is someone's, not ours. */
  readonly source: string;
}

export interface TrustContext {
  readonly now: number;
  readonly session: MarketSession;
  readonly reference: Reference | null;
}

export interface RealGap {
  /** The gap between displayed prices, as a fraction of the lower one. */
  readonly paper: number;
  readonly notionalUsd: number;
  /** Buy where the screen says it is cheap… */
  readonly buy: {
    readonly listingId: string;
    readonly venue: VenueId;
    readonly price: number | null;
  };
  /** …and sell where it says it is dear. */
  readonly sell: {
    readonly listingId: string;
    readonly venue: VenueId;
    readonly price: number | null;
  };
  /**
   * What that round trip actually returns at `notionalUsd`, before fees and
   * funding. `null` when either leg cannot be filled at that size.
   */
  readonly executable: number | null;
}

export interface AssetTrust {
  readonly view: AssetView;
  readonly listings: readonly ListingTrust[];
  /** The best verdict any venue earns: what this asset can actually offer a trader. */
  readonly best: Verdict;
  readonly realGap: RealGap | null;
}

// ---------------------------------------------------------------------------
// One listing
// ---------------------------------------------------------------------------

const TEN_K = REFERENCE_NOTIONAL_USD;

function venueWords(kind: InstrumentKind) {
  return kind === 'perpetual'
    ? { empty: 'The order book is empty.', source: 'order book' }
    : { empty: 'There is no route to trade it at any size.', source: 'swap route' };
}

function verdictFor(
  entry: ListingQuote,
  probe: DepthProbe | null,
  mid: ExecutableMid | null,
): Verdict {
  const filled = probe?.fills.some((f) => f.price !== null) ?? false;
  const measured = probe?.fills.some((f) => f.failure !== 'error') ?? false;

  if (!probe || !measured) {
    // The liquidity floor still binds without a probe: a $107 pool cannot be
    // "not measured" — it is conclusively not a market.
    return tradabilityOf(entry).state === 'dead' ? 'no-market' : 'unmeasured';
  }
  if (!filled) return 'no-market';
  if (!mid || mid.spread > NO_PRICE_SPREAD) return 'quote-only';

  const atTenK = slippageAt(probe, TEN_K, mid.mid);
  if (atTenK !== null && atTenK <= TRADABLE_SLIPPAGE) return 'tradable';
  const atOneK = slippageAt(probe, SMALL_TICKET_USD, mid.mid);
  if (atOneK !== null && atOneK <= THIN_SLIPPAGE) return 'thin';
  return 'quote-only';
}

const pct = (fraction: number | null, signed = false) =>
  formatPercentAdaptive(fraction, { signed });

function headlineFor(
  verdict: Verdict,
  kind: InstrumentKind,
  shown: number | null,
  probe: DepthProbe | null,
  mid: ExecutableMid | null,
  floorReason: string | null,
): { headline: string; short: string } {
  const shownText = shown === null ? 'A price' : `Shows ${formatPrice(shown)}`;

  switch (verdict) {
    case 'tradable': {
      const slip = probe && mid ? slippageAt(probe, TEN_K, mid.mid) : null;
      return {
        headline: `A ${formatNotional(TEN_K)} order fills within ${pct(slip)} of the market price.`,
        short: `±${pct(slip)} at ${formatNotionalShort(TEN_K)}`,
      };
    }
    case 'thin': {
      const slip = probe && mid ? slippageAt(probe, TEN_K, mid.mid) : null;
      return slip === null
        ? {
            headline: `Fine for small trades, but there isn't enough liquidity to fill ${formatNotional(TEN_K)}.`,
            short: `can't fill ${formatNotionalShort(TEN_K)}`,
          }
        : {
            headline: `Fine for small trades — a ${formatNotional(TEN_K)} order moves the price ${pct(slip)}.`,
            short: `${pct(slip)} at ${formatNotionalShort(TEN_K)}`,
          };
    }
    case 'quote-only': {
      const gap = probe ? displayGapAt(probe, SMALL_TICKET_USD) : null;
      if (!gap || shown === null) {
        return {
          headline: `${shownText}, but even small trades land far from it.`,
          short: 'no stable price',
        };
      }
      const action = gap.side === 'buy' ? 'buy fills at' : 'sale gets';
      return {
        headline: `${shownText}, but a ${formatNotional(SMALL_TICKET_USD)} ${action} ${formatPrice(gap.price)} (${pct(
          gap.side === 'buy' ? gap.fraction : -gap.fraction,
          true,
        )}).`,
        short: `${formatNotionalShort(SMALL_TICKET_USD)} ${gap.side} ${pct(
          gap.side === 'buy' ? gap.fraction : -gap.fraction,
          true,
        )}`,
      };
    }
    case 'no-market': {
      // Without fills the verdict came from the liquidity floor, so say what
      // the floor saw rather than claim a route was tried and failed.
      const measured = probe?.fills.some((f) => f.failure !== 'error') ?? false;
      if (!measured && floorReason) {
        return {
          headline: shown === null ? floorReason : `${shownText}, but ${lowerFirst(floorReason)}`,
          short: 'no liquidity',
        };
      }
      return {
        headline:
          shown === null
            ? venueWords(kind).empty
            : `${shownText}, but ${lowerFirst(venueWords(kind).empty)}`,
        short: 'no route',
      };
    }
    case 'unmeasured':
      return {
        headline: "Fills couldn't be measured just now, so the price shown is unverified.",
        short: 'not measured',
      };
  }
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

function depthCheck(
  verdict: Verdict,
  kind: InstrumentKind,
  probe: DepthProbe | null,
  mid: ExecutableMid | null,
  headline: string,
): TrustCheck {
  const receipts: Receipt[] = [];
  if (probe && mid) {
    for (const side of ['buy', 'sell'] as const) {
      const fill = fillAt(probe, side, TEN_K);
      receipts.push({
        label: `${formatNotional(TEN_K)} ${side}`,
        value:
          fill?.price != null
            ? `${formatPrice(fill.price)} (${pct(fill.price / mid.mid - 1, true)} vs mid)`
            : 'could not fill',
      });
    }
    const bound = sizeWithin(probe, mid.mid, TRADABLE_SLIPPAGE);
    if (bound)
      receipts.push({
        label: `Largest trade within ${formatThreshold(TRADABLE_SLIPPAGE)}`,
        value: formatBound(bound),
      });
    const rt = roundTripAt(probe, TEN_K);
    if (rt !== null)
      receipts.push({ label: `Round trip at ${formatNotionalShort(TEN_K)}`, value: pct(rt) });
  }

  const status: CheckStatus =
    verdict === 'tradable'
      ? 'pass'
      : verdict === 'thin'
        ? 'warn'
        : verdict === 'unmeasured'
          ? 'unknown'
          : 'fail';

  return {
    id: 'depth',
    question: 'Can it take a real order?',
    status,
    finding: headline,
    receipts,
    source: probe?.source ?? null,
  };
}

/** "≥ $100k", "≈ $20k", "< $100". */
export function formatBound(bound: SizeBound): string {
  const size = formatNotionalShort(bound.usd);
  return bound.kind === 'at-least'
    ? `≥ ${size}`
    : bound.kind === 'about'
      ? `≈ ${size}`
      : `< ${size}`;
}

function priceCheck(
  verdict: Verdict,
  shown: number | null,
  probe: DepthProbe | null,
  mid: ExecutableMid | null,
): TrustCheck {
  const base = {
    id: 'price' as const,
    question: 'Is the shown price where it trades?',
    source: probe?.source ?? null,
  };

  if (verdict === 'unmeasured' || shown === null) {
    return {
      ...base,
      status: 'unknown',
      finding: 'Nothing to compare the shown price against.',
      receipts: [],
    };
  }
  if (verdict === 'no-market') {
    return {
      ...base,
      status: 'fail',
      finding: 'Nothing can be bought or sold, so the shown price is not a price anyone can get.',
      receipts: [{ label: 'Shown', value: formatPrice(shown) }],
    };
  }
  if (!mid || mid.spread > NO_PRICE_SPREAD) {
    const smallest = mid ? formatNotional(mid.notionalUsd) : 'small';
    return {
      ...base,
      status: 'fail',
      finding: mid
        ? `There is no stable price: ${smallest} buys and sells already land ${pct(mid.spread)} apart.`
        : 'There is no stable price: small trades only fill on one side.',
      receipts: [{ label: 'Shown', value: formatPrice(shown) }],
    };
  }

  const gap = shown / mid.mid - 1;
  const magnitude = Math.abs(gap);
  const status: CheckStatus =
    magnitude <= DISPLAY_PASS ? 'pass' : magnitude <= DISPLAY_WARN ? 'warn' : 'fail';
  return {
    ...base,
    status,
    finding:
      status === 'pass'
        ? `The shown ${formatPrice(shown)} is within ${pct(magnitude)} of where it actually trades.`
        : `The shown price is ${pct(magnitude)} ${gap < 0 ? 'below' : 'above'} where it actually trades.`,
    receipts: [
      { label: 'Shown', value: formatPrice(shown) },
      { label: 'Executable mid', value: formatPrice(mid.mid) },
    ],
  };
}

function referenceCheck(
  kind: InstrumentKind,
  shown: number | null,
  mid: ExecutableMid | null,
  verdict: Verdict,
  ctx: TrustContext,
): TrustCheck {
  const base = { id: 'reference' as const, question: 'Does it track the actual stock?' };
  const sessionReceipt: Receipt = {
    label: 'US session',
    value: describeSession(ctx.session, ctx.now),
  };
  const resumes = ctx.session.externalResumesAt
    ? formatNyTime(ctx.session.externalResumesAt, ctx.now)
    : 'external markets reopen';

  // Weekends and holidays: the perp's oracle is an average of the perp's own
  // book. Checking the perp against it would be checking it against itself,
  // and a pass there would be reassurance with nothing behind it.
  if (ctx.reference && !ctx.session.externalPricing && kind === 'perpetual') {
    return {
      ...base,
      status: 'unknown',
      finding: `No stock price exists until ${resumes}: on weekends and US holidays the oracle follows this market's own order book, so there is nothing independent to check it against.`,
      receipts: [
        { label: ctx.reference.source, value: formatPrice(ctx.reference.price) },
        sessionReceipt,
      ],
      source: ctx.reference.source,
    };
  }

  if (!ctx.reference) {
    return {
      ...base,
      status: 'unknown',
      finding: 'There is no independent reference price for this asset to check against.',
      receipts: [sessionReceipt],
      source: null,
    };
  }

  // Off a dead market, the "price" being compared is only a label.
  const usable =
    mid && mid.spread <= NO_PRICE_SPREAD ? mid.mid : verdict === 'unmeasured' ? shown : null;
  if (usable === null) {
    return {
      ...base,
      status: 'unknown',
      finding: 'There is no tradable price here to compare with the underlying.',
      receipts: [
        { label: ctx.reference.source, value: formatPrice(ctx.reference.price) },
        sessionReceipt,
      ],
      source: ctx.reference.source,
    };
  }

  const deviation = usable / ctx.reference.price - 1;
  const magnitude = Math.abs(deviation);
  const status: CheckStatus =
    magnitude <= REFERENCE_PASS ? 'pass' : magnitude <= REFERENCE_WARN ? 'warn' : 'fail';
  const direction = deviation < 0 ? 'below' : 'above';

  return {
    ...base,
    status,
    finding:
      (status === 'pass'
        ? `Trades within ${pct(magnitude)} of the ${ctx.reference.source}`
        : `Trades ${pct(magnitude)} ${direction} the ${ctx.reference.source}`) +
      (!ctx.session.externalPricing
        ? ` — which, until ${resumes}, follows on-chain trading rather than the stock.`
        : !ctx.session.open && status !== 'pass'
          ? ', outside regular US hours, when the reference itself comes from thinner extended-hours trading.'
          : '.'),
    receipts: [
      { label: ctx.reference.source, value: formatPrice(ctx.reference.price) },
      { label: verdict === 'unmeasured' ? 'Shown' : 'Executable mid', value: formatPrice(usable) },
      sessionReceipt,
    ],
    source: ctx.reference.source,
  };
}

function activityCheck(
  entry: ListingQuote,
  probe: DepthProbe | null,
  ctx: TrustContext,
): TrustCheck {
  const base = { id: 'activity' as const, question: 'Is anyone trading it?' };
  const { listing, quote } = entry;

  if (listing.kind === 'perpetual') {
    const last = probe?.lastTradeAt ?? null;
    if (last !== null) {
      const age = ctx.now - last;
      const status: CheckStatus =
        age <= 60 * 60_000 ? 'pass' : age <= 24 * 60 * 60_000 ? 'warn' : 'fail';
      return {
        ...base,
        status,
        finding: `Last trade ${formatRelativeTime(last, ctx.now)}.`,
        receipts: [{ label: '24h volume', value: formatCompactUsd(quote?.volume24h ?? null) }],
        source: 'Hyperliquid recent trades',
      };
    }
    const volume = quote?.volume24h ?? null;
    if (volume === null) {
      return {
        ...base,
        status: 'unknown',
        finding: 'The venue reports no volume figure.',
        receipts: [],
        source: null,
      };
    }
    return {
      ...base,
      status: volume > 0 ? 'pass' : 'fail',
      finding:
        volume > 0
          ? `${formatCompactUsd(volume)} traded in the last 24 hours.`
          : 'Nothing traded in the last 24 hours.',
      receipts: [],
      source: 'Hyperliquid asset context',
    };
  }

  // Pool-backed: a missing count means no trades, for the same reason a missing
  // liquidity figure means no pool — see `tradability.ts`.
  const hour = quote?.tradeCount1h ?? 0;
  const day = quote?.tradeCount24h ?? 0;
  const receipts = [
    { label: 'Trades, last hour', value: formatCount(hour) },
    { label: 'Trades, last 24h', value: formatCount(day) },
  ];
  if (hour > 0) {
    return {
      ...base,
      status: 'pass',
      finding: `${formatCount(hour)} trades in the last hour.`,
      receipts,
      source: 'Jupiter token stats',
    };
  }
  if (day > 0) {
    return {
      ...base,
      status: 'warn',
      finding: `No trades in the last hour; ${formatCount(day)} in the last 24.`,
      receipts,
      source: 'Jupiter token stats',
    };
  }
  return {
    ...base,
    status: 'fail',
    finding: 'No trades in 24 hours — nobody has tested this price.',
    receipts,
    source: 'Jupiter token stats',
  };
}

export function listingTrust(
  entry: ListingQuote,
  probe: DepthProbe | null,
  ctx: TrustContext,
): ListingTrust {
  const { listing, quote } = entry;
  const shown = probe?.displayedPrice ?? quote?.price ?? null;
  const mid = probe ? executableMid(probe) : null;
  const verdict = verdictFor(entry, probe, mid);
  const { headline, short } = headlineFor(
    verdict,
    listing.kind,
    shown,
    probe,
    mid,
    tradabilityOf(entry).reasons[0] ?? null,
  );

  const slippage = probe
    ? [...new Set(probe.fills.map((f) => f.notionalUsd))]
        .sort((a, b) => a - b)
        .map((notionalUsd) => ({
          notionalUsd,
          fraction: mid ? slippageAt(probe, notionalUsd, mid.mid) : null,
        }))
    : [];

  return {
    listingId: listing.id,
    venue: listing.venue,
    kind: listing.kind,
    verdict,
    headline,
    short,
    displayedPrice: shown,
    mid,
    slippage,
    displayGap: probe ? displayGapAt(probe, SMALL_TICKET_USD) : null,
    withinOnePercent: probe && mid ? sizeWithin(probe, mid.mid, TRADABLE_SLIPPAGE) : null,
    roundTrip: probe ? roundTripAt(probe, TEN_K) : null,
    checks: [
      depthCheck(verdict, listing.kind, probe, mid, headline),
      priceCheck(verdict, shown, probe, mid),
      referenceCheck(listing.kind, shown, mid, verdict, ctx),
      activityCheck(entry, probe, ctx),
    ],
    measuredAt: probe?.measuredAt ?? null,
    probe,
  };
}

// ---------------------------------------------------------------------------
// One asset
// ---------------------------------------------------------------------------

/**
 * The underlying's reference price: the perp venue's oracle, where there is one.
 *
 * Named for what it is. It is the venue's oracle, not the exchange print, and
 * outside US hours it is not the exchange print at all — the receipt says so.
 */
export function referenceFor(view: AssetView): Reference | null {
  for (const { listing, quote } of view.listings) {
    if (listing.kind === 'perpetual' && quote?.oraclePrice && quote.oraclePrice > 0) {
      return { price: quote.oraclePrice, source: 'trade[XYZ] oracle' };
    }
  }
  return null;
}

export function assetTrust(
  view: AssetView,
  probes: ProbeIndex,
  base: Omit<TrustContext, 'reference'>,
): AssetTrust {
  const ctx: TrustContext = { ...base, reference: referenceFor(view) };
  const listings = view.listings.map((entry) =>
    listingTrust(entry, probes[entry.listing.id] ?? null, ctx),
  );
  const best = listings.map((l) => l.verdict).sort(compareVerdicts)[0] ?? 'unmeasured';
  return { view, listings, best, realGap: realGapFor(listings) };
}

/**
 * Can the gap on the screen actually be captured?
 *
 * Takes the trade the displayed prices suggest — buy where it looks cheap, sell
 * where it looks dear — and prices both legs at the reference size from the
 * fills. Perp legs are a short, not a sale, and carry funding; the result is
 * stated before fees and funding, and labelled so.
 */
export function realGapFor(listings: readonly ListingTrust[]): RealGap | null {
  const priced = listings.filter(
    (l): l is ListingTrust & { displayedPrice: number; probe: DepthProbe } =>
      l.displayedPrice !== null && l.displayedPrice > 0 && l.probe !== null,
  );
  if (priced.length < 2) return null;

  let low = priced[0]!;
  let high = priced[0]!;
  for (const l of priced) {
    if (l.displayedPrice < low.displayedPrice) low = l;
    if (l.displayedPrice > high.displayedPrice) high = l;
  }
  if (low === high) return null;

  const buyPrice = fillAt(low.probe, 'buy', TEN_K)?.price ?? null;
  const sellPrice = fillAt(high.probe, 'sell', TEN_K)?.price ?? null;

  return {
    paper: (high.displayedPrice - low.displayedPrice) / low.displayedPrice,
    notionalUsd: TEN_K,
    buy: { listingId: low.listingId, venue: low.venue, price: buyPrice },
    sell: { listingId: high.listingId, venue: high.venue, price: sellPrice },
    executable: buyPrice !== null && sellPrice !== null ? sellPrice / buyPrice - 1 : null,
  };
}

// ---------------------------------------------------------------------------
// The whole index
// ---------------------------------------------------------------------------

export interface BoardStats {
  readonly listings: number;
  readonly byVerdict: Readonly<Record<Verdict, number>>;
  /** The same tally per venue — where the untradable prices actually live. */
  readonly byVenue: Readonly<Partial<Record<VenueId, Readonly<Record<Verdict, number>>>>>;
  /** Epoch ms of the oldest measurement in the set — how stale the board can be. */
  readonly oldestMeasurement: number | null;
}

const emptyTally = (): Record<Verdict, number> => ({
  tradable: 0,
  thin: 0,
  'quote-only': 0,
  'no-market': 0,
  unmeasured: 0,
});

export function boardStats(assets: readonly AssetTrust[]): BoardStats {
  const byVerdict = emptyTally();
  const byVenue: Partial<Record<VenueId, Record<Verdict, number>>> = {};
  let listings = 0;
  let oldest: number | null = null;
  for (const asset of assets) {
    for (const l of asset.listings) {
      listings++;
      byVerdict[l.verdict]++;
      (byVenue[l.venue] ??= emptyTally())[l.verdict]++;
      if (l.measuredAt !== null)
        oldest = oldest === null ? l.measuredAt : Math.min(oldest, l.measuredAt);
    }
  }
  return { listings, byVerdict, byVenue, oldestMeasurement: oldest };
}

/** A price on the screen and nothing behind it: quote-only plus no-market. */
export const isUntradable = (verdict: Verdict) =>
  verdict === 'quote-only' || verdict === 'no-market';

export interface DisplayGapEntry {
  readonly asset: AssetTrust;
  readonly listing: ListingTrust;
}

/**
 * Where the displayed price is furthest from what a trade gets, worst first.
 *
 * Quote-only listings, ranked by how far a $1k trade lands from the price on
 * the screen. Listings with no market at all are counted separately
 * (`listingsWithVerdict`): "no route" has no distance to rank by, and a list
 * of them sorted alphabetically would bury the measured cases that show the
 * size of the problem.
 */
export function worstDisplayGaps(assets: readonly AssetTrust[], limit = 5): DisplayGapEntry[] {
  const entries: (DisplayGapEntry & { score: number })[] = [];
  for (const asset of assets) {
    for (const listing of asset.listings) {
      if (listing.verdict !== 'quote-only' || listing.displayedPrice === null) continue;
      entries.push({ asset, listing, score: listing.displayGap?.fraction ?? 0 });
    }
  }
  return entries
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ asset, listing }) => ({ asset, listing }));
}

/** Every listing with this verdict, ordered by ticker. */
export function listingsWithVerdict(
  assets: readonly AssetTrust[],
  verdict: Verdict,
): DisplayGapEntry[] {
  return assets
    .flatMap((asset) =>
      asset.listings.filter((l) => l.verdict === verdict).map((listing) => ({ asset, listing })),
    )
    .sort((a, b) => a.asset.view.asset.symbol.localeCompare(b.asset.view.asset.symbol));
}

export interface GapEntry {
  readonly asset: AssetTrust;
  readonly gap: RealGap;
}

/** Cross-venue gaps, ranked by what they return when actually executed at size. */
export function realDislocations(assets: readonly AssetTrust[], limit = 5): GapEntry[] {
  return assets
    .flatMap((asset) => (asset.realGap ? [{ asset, gap: asset.realGap }] : []))
    .sort((a, b) => (b.gap.executable ?? -Infinity) - (a.gap.executable ?? -Infinity))
    .slice(0, limit);
}

/**
 * Cross-venue gaps as a price screen would rank them — widest first — each
 * carrying what it returns when actually traded. The juxtaposition is the
 * point: the widest gaps on screen are routinely the least executable.
 */
export function paperGaps(assets: readonly AssetTrust[], limit = 5): GapEntry[] {
  return assets
    .flatMap((asset) => (asset.realGap ? [{ asset, gap: asset.realGap }] : []))
    .sort((a, b) => b.gap.paper - a.gap.paper)
    .slice(0, limit);
}

/** Paper gaps over 1% — the ones a price screen would headline — and how many survive execution. */
export function paperGapSurvival(assets: readonly AssetTrust[]): {
  headlined: number;
  survive: number;
} {
  let headlined = 0;
  let survive = 0;
  for (const { realGap } of assets) {
    if (!realGap || realGap.paper <= 0.01) continue;
    headlined++;
    if (realGap.executable !== null && realGap.executable > 0) survive++;
  }
  return { headlined, survive };
}
