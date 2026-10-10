import { describeSession, VERDICT_LABEL } from '@marketroom/core';
import { NextResponse } from 'next/server';
import { getTrustBoard } from '@/lib/data';

/**
 * The trust board as JSON — every listing's verdict, read-only.
 *
 * Built from the same cached measurement the pages render from, so serving it
 * adds no upstream load. The intended consumer is anyone who shows a price to
 * someone about to trade it: a wallet that can say "this price is not
 * tradable" before the swap is a better wallet.
 */
// Dynamic, not prerendered: a static route handler would be rendered once at
// build time and serve the build's measurement — usually a throttled one —
// until its first revalidation. The CDN still caches it via Cache-Control.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  try {
    const board = await getTrustBoard();
    return NextResponse.json(
      {
        generatedAt: new Date(board.now).toISOString(),
        oldestMeasurement:
          board.stats.oldestMeasurement === null
            ? null
            : new Date(board.stats.oldestMeasurement).toISOString(),
        session: describeSession(board.session, board.now),
        method: '/about#method',
        stats: board.stats,
        listings: board.assets.flatMap((asset) =>
          asset.listings.map((l) => ({
            asset: asset.view.asset.id,
            symbol: asset.view.asset.symbol,
            listing: l.listingId,
            venue: l.venue,
            kind: l.kind,
            verdict: l.verdict,
            label: VERDICT_LABEL[l.verdict],
            headline: l.headline,
            displayedPrice: l.displayedPrice,
            executableMid: l.mid?.mid ?? null,
            roundTripAt10k: l.roundTrip,
            measuredAt: l.measuredAt === null ? null : new Date(l.measuredAt).toISOString(),
            checks: Object.fromEntries(l.checks.map((c) => [c.id, c.status])),
          })),
        ),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Trust board unavailable' },
      { status: 503 },
    );
  }
}
