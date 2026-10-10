import { describeSession, usEquitySession } from '@marketroom/core';
import { NextResponse } from 'next/server';
import { getAssetTrust, getAssetView } from '@/lib/data';

/**
 * One asset's trust check as JSON, with every measured fill — the receipts a
 * reader of the market page sees, in a form a program can check.
 */
export const revalidate = 60;
export const maxDuration = 30;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const view = await getAssetView(id);
    if (!view) return NextResponse.json({ error: `No market "${id}"` }, { status: 404 });
    const trust = await getAssetTrust(view);
    const now = Date.now();
    return NextResponse.json(
      {
        asset: { id: view.asset.id, symbol: view.asset.symbol, name: view.asset.name },
        generatedAt: new Date(now).toISOString(),
        session: describeSession(usEquitySession(now), now),
        method: '/about#method',
        best: trust.best,
        realGap: trust.realGap,
        listings: trust.listings.map(({ probe, ...listing }) => ({
          ...listing,
          measuredAt:
            listing.measuredAt === null ? null : new Date(listing.measuredAt).toISOString(),
          fills: probe?.fills ?? [],
          source: probe?.source ?? null,
        })),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Trust check unavailable' },
      { status: 503 },
    );
  }
}
