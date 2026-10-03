import { candleRangeById, type Candle } from '@marketroom/core';
import { NextResponse } from 'next/server';
import { getAssetView, getCandlesForRange } from '@/lib/data';

/**
 * Candles for one asset and range.
 *
 * Exists so the chart's range buttons do not have to be paid for at build
 * time. Pre-rendering every range for every market would mean 110 pages × 5
 * ranges of upstream calls before the site even deploys; the page ships the
 * default range and the rest are fetched when someone actually asks.
 *
 * Reads through the same cache the page uses, so a range someone else already
 * opened is served from memory.
 */
export const revalidate = 30;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const assetId = params.get('asset');
  const rangeId = params.get('range');

  const range = rangeId ? candleRangeById(rangeId) : undefined;
  if (!assetId || !range) {
    return NextResponse.json({ error: 'Unknown asset or range' }, { status: 400 });
  }

  const view = await getAssetView(assetId);
  const listing = view?.listings.find(({ listing }) => listing.venue === 'hyperliquid')?.listing;

  // No chartable venue is a valid answer, not an error — Solana-only assets
  // have no candle source at all.
  if (!listing) return NextResponse.json({ candles: [] as Candle[] });

  const candles = await getCandlesForRange(listing, range.id);

  return NextResponse.json(
    { candles },
    { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } },
  );
}
