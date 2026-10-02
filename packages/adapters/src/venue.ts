/**
 * The venue abstraction.
 *
 * Every venue Marketroom aggregates implements this interface. Adding a third
 * chain means writing one adapter and mapping tickers — `core`, the UI and the
 * catalog do not change. That is the property that makes the long-term
 * "DexScreener of on-chain stocks" direction tractable rather than a rewrite.
 *
 * Capabilities are declared rather than assumed, because venues genuinely
 * differ: Hyperliquid serves real OHLCV and an order book, while a Solana
 * token has pool liquidity and holder counts but no candles. The UI reads
 * `capabilities` and renders what exists instead of showing empty panels.
 */

import type { Candle, Interval, Listing, OrderBook, Quote, Venue, VenueId } from '@marketroom/core';

export interface VenueCapabilities {
  readonly candles: boolean;
  readonly orderBook: boolean;
  readonly realtime: boolean;
  readonly openInterest: boolean;
  readonly funding: boolean;
  readonly liquidity: boolean;
  readonly holders: boolean;
}

export interface VenueAdapter {
  readonly venue: Venue;
  readonly capabilities: VenueCapabilities;

  /** Every listing this venue carries, joined to canonical assets. */
  listListings(signal?: AbortSignal): Promise<Listing[]>;

  /** Live quotes for all listings. One call, not one per listing. */
  fetchQuotes(signal?: AbortSignal): Promise<Quote[]>;

  /** OHLCV. Only called when `capabilities.candles`. */
  fetchCandles?(
    listing: Listing,
    interval: Interval,
    lookbackMs: number,
    signal?: AbortSignal,
  ): Promise<Candle[]>;

  /** L2 book. Only called when `capabilities.orderBook`. */
  fetchOrderBook?(listing: Listing, signal?: AbortSignal): Promise<OrderBook>;
}

/** Thrown by adapters so callers can attribute a failure to a venue. */
export class VenueError extends Error {
  constructor(
    readonly venue: VenueId,
    message: string,
    readonly reason?: unknown,
  ) {
    super(`[${venue}] ${message}`);
    this.name = 'VenueError';
  }
}
