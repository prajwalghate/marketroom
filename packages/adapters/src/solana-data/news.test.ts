import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clip, decodeEntities, mentionsSolana, parseFeed, stripHtml, SUMMARY_MAX } from './news';

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');

describe('RSS 2.0', () => {
  it('reads the Solana Foundation feed, dropping an undated item', () => {
    const items = parseFeed(fixture('solana-rss.xml'), 'https://solana.com/news/rss.xml');
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      url: 'https://solana.com/news/samsung-wallet',
      title:
        'Samsung Partners with Solana to Natively Deliver Stablecoins in Samsung Wallet to 82 Million U.S. Galaxy Devices',
      summary:
        'Beginning the last week of October 2026, Samsung Wallet will support USDC cross-border transfers on Solana across 82 million U.S. Galaxy devices.',
      publishedAt: Date.UTC(2026, 9, 7, 23, 30),
      imageUrl: 'https://solana.com/uploads/posts/samsung-wallet/heroImage.webp',
    });
  });

  it('keeps the summary, never the full post in content:encoded', () => {
    const [item] = parseFeed(fixture('colosseum-rss.xml'));
    expect(item!.summary).toBe('MetaDAO Backable, Solana DvP Atomic Settlement, Web3.js v3');
    expect(JSON.stringify(item)).not.toMatch(/Never stored|whole post/);
    expect(item!.imageUrl).toMatch(
      /^https:\/\/storage\.ghost\.io\/.+colosseum-codex-2026-10-08\.png$/,
    );
    expect(item!.url).toBe('https://blog.colosseum.com/metadao-backable-solana-dvp-web3js-v3');
  });

  it('strips markup from summaries and tracking from links', () => {
    const [item] = parseFeed(fixture('cointelegraph-rss.xml'));
    expect(item!.url).toBe(
      'https://cointelegraph.com/magazine/weaker-dollar-crypto-green-light-raoul-pal-trade-secrets',
    );
    expect(item!.summary).toMatch(/^Real Vision founder Raoul Pal says/);
    expect(item!.summary).not.toMatch(/[<>]/);
    expect(item!.imageUrl).toMatch(/^https:\/\/s3-images\.ctmedia\.io\//);
    expect(item!.publishedAt).toBe(Date.UTC(2026, 9, 6, 13, 30));
  });

  it('decodes entities escaped once or twice, and finds an inline image', () => {
    const items = parseFeed(fixture('decrypt-rss.xml'));
    const item = items.find((i) => i.url === 'https://decrypt.co/380000/kamino-jupiter')!;
    expect(item.title).toBe("Kamino's vaults & Jupiter’s perps");
    expect(item.summary).toBe('Two Solana protocols ship upgrades.');
    expect(item.imageUrl).toBe('https://cdn.decrypt.co/inline.png');
  });
});

describe('Atom', () => {
  it('reads Helius’s feed: links from href, dates from updated, no article bodies', () => {
    const items = parseFeed(fixture('helius-atom.xml'));
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      url: 'https://www.helius.dev/blog/agave-v4-3',
      title: 'Agave 4.3 Update: All You Need to Know',
      publishedAt: Date.UTC(2026, 8, 21, 10),
      imageUrl: null,
    });
    expect(items[0]!.summary).toMatch(/^A roundup of the most important changes/);
    expect(JSON.stringify(items)).not.toMatch(/full article body/);
  });
});

describe('what is not a feed', () => {
  it('refuses an error page served as a feed', () => {
    expect(() => parseFeed(fixture('not-a-feed.html'))).toThrow(/Not an RSS or Atom feed/);
  });

  it('reads a valid feed with no items as empty', () => {
    expect(parseFeed('<rss version="2.0"><channel><title>x</title></channel></rss>')).toEqual([]);
  });
});

describe('text', () => {
  it('decodes HTML entities, leaving what it does not know', () => {
    expect(decodeEntities('It&#x2019;s &amp; &#8220;quoted&#8221;')).toBe('It’s & “quoted”');
    expect(decodeEntities('&unknown; &#55357;')).toBe('&unknown; &#55357;');
  });

  it('strips markup and collapses whitespace', () => {
    expect(stripHtml('<p>One&nbsp;<b>two</b></p>\n<script>evil()</script><p>three</p>')).toBe(
      'One two three',
    );
  });

  it('clips to the limit at a word, with an ellipsis', () => {
    const long = 'word '.repeat(200);
    const clipped = clip(long);
    expect(clipped.length).toBeLessThanOrEqual(SUMMARY_MAX);
    expect(clipped.endsWith('word…')).toBe(true);
    expect(clip('short')).toBe('short');
  });

  it('knows a story about Solana', () => {
    expect(mentionsSolana('Solana ETF inflows')).toBe(true);
    expect(mentionsSolana('SOL breaks $300')).toBe(true);
    expect(mentionsSolana('a sol-gel process')).toBe(false);
    expect(mentionsSolana('console logs')).toBe(false);
  });
});
