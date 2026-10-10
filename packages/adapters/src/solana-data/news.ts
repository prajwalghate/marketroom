/**
 * Solana news, from publishers' own feeds.
 *
 * Verified 2026-10-10. Seven feeds of two kinds:
 *
 *  - Solana-focused — the Solana Foundation, Helius, Colosseum, and
 *    Cointelegraph's Solana tag. Every item is about Solana; all are kept.
 *  - General crypto press — The Block, Decrypt, CoinDesk. Most of what they
 *    publish is about something else, so an item is kept only when it names
 *    Solana or a project in the database (the import job decides the latter).
 *
 * Only what a feed offers as a summary is kept, stripped of markup and cut to
 * 300 characters. Several feeds carry whole articles — Helius's Atom feed is
 * 5.7 MB, Colosseum's `content:encoded` is the full post — and those bodies
 * are skipped unparsed and never stored: the article is the publisher's to
 * show, and a reader follows the link to it.
 */

import { canonicalUrl } from '@marketroom/core';
import { XMLParser } from 'fast-xml-parser';
import { getText, mapSettledLimit } from '../http';
import { USER_AGENT } from './rpc';

export interface NewsFeed {
  readonly url: string;
  readonly publisher: string;
  /** `solana`: every item is kept. `general`: only items about Solana or a known project. */
  readonly scope: 'solana' | 'general';
  /** What an item is as a source: the publisher's own announcement, or press. */
  readonly kind: 'announcement' | 'press';
}

export const NEWS_FEEDS: readonly NewsFeed[] = [
  {
    url: 'https://solana.com/news/rss.xml',
    publisher: 'Solana',
    scope: 'solana',
    kind: 'announcement',
  },
  {
    url: 'https://www.helius.dev/blog/rss.xml',
    publisher: 'Helius',
    scope: 'solana',
    kind: 'announcement',
  },
  {
    url: 'https://blog.colosseum.com/rss/',
    publisher: 'Colosseum',
    scope: 'solana',
    kind: 'announcement',
  },
  {
    url: 'https://cointelegraph.com/rss/tag/solana',
    publisher: 'Cointelegraph',
    scope: 'solana',
    kind: 'press',
  },
  {
    url: 'https://www.theblock.co/rss.xml',
    publisher: 'The Block',
    scope: 'general',
    kind: 'press',
  },
  { url: 'https://decrypt.co/feed', publisher: 'Decrypt', scope: 'general', kind: 'press' },
  {
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    publisher: 'CoinDesk',
    scope: 'general',
    kind: 'press',
  },
];

export interface FeedItem {
  /** Canonical: tracking parameters and fragments removed. */
  readonly url: string;
  readonly title: string;
  /** Plain text, at most `SUMMARY_MAX` characters. */
  readonly summary: string | null;
  /** Unix ms. */
  readonly publishedAt: number;
  readonly imageUrl: string | null;
}

export const SUMMARY_MAX = 300;

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  middot: '·',
  bull: '•',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
  pound: '£',
};

/**
 * HTML entities, decoded. The XML parser decodes XML's own five; feeds also
 * carry HTML's (`&nbsp;`, `&#8217;`), sometimes escaped twice (`&amp;#039;`).
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      const valid = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
      return valid ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Markup removed, entities decoded, whitespace collapsed. */
export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** At most `max` characters, cut at a word where one is near, marked with an ellipsis. */
export function clip(text: string, max = SUMMARY_MAX): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  const kept = space > max * 0.6 ? cut.slice(0, space) : cut;
  return `${kept.replace(/[\s,;:.–—-]+$/, '')}…`;
}

/** Whether a text names Solana: the word, or the ticker written as one. */
export function mentionsSolana(text: string): boolean {
  return /\bsolana\b/i.test(text) || /\bSOL\b/.test(text);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

type Node = unknown;

const textOf = (node: Node): string => {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.length ? textOf(node[0]) : '';
  if (node && typeof node === 'object') return textOf((node as Record<string, Node>)['#text']);
  return '';
};

const list = (node: Node): Node[] => (Array.isArray(node) ? node : node == null ? [] : [node]);

const attr = (node: Node, name: string): string | null => {
  if (!node || typeof node !== 'object') return null;
  const value = (node as Record<string, Node>)[`@${name}`];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const absolute = (href: string | null, base?: string): string | null => {
  if (!href) return null;
  try {
    const url = new URL(href.trim(), base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
};

const IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i;

function itemLink(item: Record<string, Node>, base?: string): string | null {
  for (const link of list(item.link)) {
    // RSS: <link>url</link>. Atom: <link rel="alternate" href="url"/>.
    if (typeof link === 'string') {
      const href = absolute(link, base);
      if (href) return href;
      continue;
    }
    const rel = attr(link, 'rel');
    if (!rel || rel === 'alternate') {
      const href = absolute(attr(link, 'href') ?? textOf(link), base);
      if (href) return href;
    }
  }
  // Some feeds put the permalink only in <guid> (or Atom's <id>). Only an
  // absolute one counts: a bare guid like "samsung-wallet" is an identifier.
  const guid = item.guid ?? item.id;
  return attr(guid, 'isPermaLink') === 'false' ? null : absolute(textOf(guid));
}

function itemImage(item: Record<string, Node>, rawSummary: string, base?: string): string | null {
  const candidates: (string | null)[] = [];
  for (const e of list(item.enclosure)) {
    const type = attr(e, 'type');
    const url = attr(e, 'url');
    if ((type?.startsWith('image/') || (url && IMAGE_FILE.test(url))) && url) candidates.push(url);
  }
  for (const m of list(item['media:content'])) {
    if (attr(m, 'medium') === 'image' || attr(m, 'type')?.startsWith('image/'))
      candidates.push(attr(m, 'url'));
  }
  for (const m of list(item['media:thumbnail'])) candidates.push(attr(m, 'url'));
  for (const link of list(item.link)) {
    if (attr(link, 'rel') === 'enclosure' && attr(link, 'type')?.startsWith('image/'))
      candidates.push(attr(link, 'href'));
  }
  candidates.push(rawSummary.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1] ?? null);
  for (const c of candidates) {
    const url = absolute(c, base);
    if (url) return url;
  }
  return null;
}

function itemDate(item: Record<string, Node>): number | null {
  for (const key of ['pubDate', 'published', 'dc:date', 'updated', 'atom:updated']) {
    const value = textOf(item[key]).trim();
    if (!value) continue;
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

const parser = () =>
  new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    // Full article bodies: kept as raw, unparsed text and then ignored.
    stopNodes: ['*.content:encoded', '*.entry.content'],
    isArray: (name) =>
      ['item', 'entry', 'link', 'enclosure', 'media:content', 'media:thumbnail'].includes(name),
  });

/**
 * Items from an RSS 2.0, RSS 1.0 or Atom document. Items without a title, a
 * link or a date are dropped: they cannot be shown or ordered. Throws for a
 * document that is not a feed at all — an error page served with HTTP 200.
 */
export function parseFeed(xml: string, baseUrl?: string): FeedItem[] {
  const doc = parser().parse(xml) as Record<string, Record<string, Node> | undefined>;
  const rss = doc.rss?.channel as Record<string, Node> | undefined;
  const rdf = doc['rdf:RDF'];
  const atom = doc.feed;
  if (!rss && !rdf && !atom) throw new Error('Not an RSS or Atom feed');
  const raw = list(rss?.item ?? rdf?.item ?? atom?.entry);

  const items = new Map<string, FeedItem>();
  for (const node of raw) {
    if (!node || typeof node !== 'object') continue;
    const item = node as Record<string, Node>;
    const title = stripHtml(textOf(item.title));
    const link = itemLink(item, baseUrl);
    const publishedAt = itemDate(item);
    if (!title || !link || publishedAt === null) continue;
    const rawSummary = textOf(item.description ?? item.summary ?? item['dc:description']);
    const plain = stripHtml(rawSummary);
    const url = canonicalUrl(link);
    if (items.has(url)) continue;
    items.set(url, {
      url,
      title: clip(title, 500),
      summary: plain && plain !== title ? clip(plain) : null,
      publishedAt,
      imageUrl: itemImage(item, rawSummary, baseUrl),
    });
  }
  return [...items.values()];
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export interface FeedResult {
  readonly feed: NewsFeed;
  readonly items: readonly FeedItem[];
  /** Why the feed could not be read; `null` when it was. */
  readonly error: string | null;
}

export class SolanaNews {
  constructor(
    private readonly options: { signal?: AbortSignal; feeds?: readonly NewsFeed[] } = {},
  ) {}

  async fetch(feed: NewsFeed): Promise<FeedItem[]> {
    const xml = await getText(feed.url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5',
      },
      signal: this.options.signal,
      timeoutMs: 30_000,
      retries: 1,
    });
    return parseFeed(xml, feed.url);
  }

  /** Every feed, settled: one feed failing does not lose the others. */
  async fetchAll(): Promise<FeedResult[]> {
    const feeds = this.options.feeds ?? NEWS_FEEDS;
    const settled = await mapSettledLimit(feeds, 4, (feed) => this.fetch(feed));
    return settled.map((result, i) => ({
      feed: feeds[i]!,
      items: result.status === 'fulfilled' ? result.value : [],
      error:
        result.status === 'rejected'
          ? result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
          : null,
    }));
  }
}
