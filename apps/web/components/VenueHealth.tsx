import type { VenueStatus } from '@marketroom/core';
import { formatRelativeTime } from '@marketroom/core';

/**
 * Venue data health.
 *
 * Shown only when something is wrong. An aggregator that silently drops a dead
 * source is worse than one that has no sources: the user sees a shorter list
 * and has no way to know it is incomplete. When every venue is healthy this
 * renders nothing rather than adding chrome.
 */
export function VenueHealth({ venues }: { venues: readonly VenueStatus[] }) {
  const degraded = venues.filter((venue) => !venue.ok);
  if (degraded.length === 0) return null;

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'center',
        padding: '9px 13px',
        marginBottom: 16,
        fontSize: 'var(--mr-text-xs)',
        color: 'var(--mr-warn)',
        background: 'var(--mr-warn-soft)',
        border: '1px solid transparent',
        borderRadius: 'var(--mr-radius)',
      }}
    >
      <span aria-hidden="true">⚠</span>
      <span>
        {degraded.map((venue) => venue.venue).join(', ')} data unavailable — listings from{' '}
        {degraded.length === 1 ? 'this venue are' : 'these venues are'} missing from the table
        below.
      </span>
      <span style={{ color: 'var(--mr-text-subtle)' }}>
        checked {formatRelativeTime(degraded[0]!.fetchedAt)}
      </span>
    </div>
  );
}
