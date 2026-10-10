import { permanentRedirect } from 'next/navigation';

/** Rounds are listed on the fundraising page; each round has its own page under /rounds. */
export default function RoundsIndex() {
  permanentRedirect('/fundraising');
}
