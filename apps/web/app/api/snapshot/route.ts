import { getSnapshot } from '@/lib/data';
import { NextResponse } from 'next/server';

/**
 * Public JSON snapshot.
 *
 * Reads the same cached object the pages render from, so it adds no upstream
 * load. Useful for debugging, for the partner's local work, and as the seam a
 * future mobile client would consume.
 */
export const revalidate = 15;

export async function GET() {
  try {
    const snapshot = await getSnapshot();
    return NextResponse.json(snapshot, {
      headers: {
        // Serve stale instantly while revalidating in the background — a
        // visitor never waits on an upstream API.
        'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Snapshot unavailable' },
      { status: 503 },
    );
  }
}
