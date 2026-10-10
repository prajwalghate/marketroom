import { loadUpdates } from '@marketroom/db';
import { parseWatch } from '@/lib/api';
import { researchDb } from '@/lib/research';

/**
 * Updates as an RSS feed — alerts for anyone with a feed reader, no account
 * needed. `?watch=project:drift,organization:multicoin-capital` narrows it to
 * those records; without it, every public update.
 */
export const dynamic = 'force-dynamic';

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function GET(request: Request) {
  const url = new URL(request.url);
  const watch = parseWatch(url.searchParams.get('watch'));
  const updates = await loadUpdates(await researchDb(), { watch, limit: 100 });
  const origin = `${url.protocol}//${url.host}`;
  const title = watch?.length
    ? `Marketroom updates: ${watch.map((w) => w.slug).join(', ')}`
    : 'Marketroom updates';
  const items = updates
    .map((u) => {
      const link = u.external ? u.url : `${origin}${u.url}`;
      const about = u.subject ? `${u.subject.name}: ` : '';
      return `<item><title>${escape(`${about}${u.title}`)}</title><link>${escape(link)}</link><guid isPermaLink="false">${u.id}</guid><pubDate>${new Date(u.at).toUTCString()}</pubDate>${u.publisher ? `<source url="${escape(link)}">${escape(u.publisher)}</source>` : ''}</item>`;
    })
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escape(title)}</title><link>${origin}/updates</link><description>New funding rounds, team changes, program mappings, editor checks and news for Solana projects.</description>${items}</channel></rss>`;
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300',
    },
  });
}
