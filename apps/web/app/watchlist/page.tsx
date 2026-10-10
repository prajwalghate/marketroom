import type { Metadata } from 'next';
import { WatchlistView } from '@/components/sol/Watchlist';
import { PageHead } from '@/components/sol/primitives';

export const metadata: Metadata = {
  title: 'Watchlist',
  description:
    'The Solana projects, investors, people and tokens you are watching, and what changed for them.',
};

export default function WatchlistPage() {
  return (
    <div className="mr-container">
      <PageHead
        title="Watchlist"
        lead="Everything you watch — projects, investors, people and tokens — and the updates to them. Kept in this browser only: nothing is sent anywhere except the names you watch, to fetch their figures. Clearing your browser data clears the list."
      />
      <WatchlistView />
    </div>
  );
}
