import type { VenueStatus } from '@marketroom/core';
import { formatRelativeTime } from '@marketroom/core';

/**
 * Venue data health.
 *
 * Shown only when something is wrong. An aggregator that silently drops a dead
 * source is worse than one that has no sources: the user sees a shorter list
 * and has no way to know it is incomplete. When every venue is healthy this
 * renders nothing rather than adding chrome.
 *
 * Two distinct failure modes, because they mean different things to the reader:
 *  - stale  — the venue is unreachable but we are serving its last good data
 *  - absent — no data at all, so those markets are missing from the table
 */
export function VenueHealth({ venues }: { venues: readonly VenueStatus[] }) {
  const degraded = venues.filter((venue) => !venue.ok);
  if (degraded.length === 0) return null;

  const stale = degraded.filter((venue) => venue.listingCount > 0);
  const absent = degraded.filter((venue) => venue.listingCount === 0);

  return (
    <div
      role="status"
      style={{
        display: 'grid',
        gap: 4,
        padding: '9px 13px',
        marginBottom: 16,
        fontSize: 'var(--mr-text-xs)',
        color: 'var(--mr-warn)',
        background: 'var(--mr-warn-soft)',
        border: '1px solid transparent',
        borderRadius: 'var(--mr-radius)',
      }}
    >
      {stale.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span aria-hidden="true">⚠</span>
          <span>
            {stale.map((venue) => venue.venue).join(', ')} is not responding — showing the last
            known prices, last updated {formatRelativeTime(stale[0]!.fetchedAt)}.
          </span>
        </div>
      )}

      {absent.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span aria-hidden="true">⚠</span>
          <span>
            {absent.map((venue) => venue.venue).join(', ')} data unavailable — listings from{' '}
            {absent.length === 1 ? 'this venue are' : 'these venues are'} missing from the table
            below.
          </span>
        </div>
      )}
    </div>
  );
}
