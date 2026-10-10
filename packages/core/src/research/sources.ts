/**
 * Sources: what a link is, and who published it.
 *
 * Evidence is only as useful as a reader's ability to judge it, and the first
 * thing a reader asks of a link is "who says so?". A funding round backed by
 * a press article reads differently from one backed by a tweet; both read
 * differently from a database entry. Classification is by domain and is
 * deliberately coarse; editors correct it per source.
 */

export type SourceKindGuess =
  | 'announcement'
  | 'press'
  | 'filing'
  | 'social'
  | 'database'
  | 'api'
  | 'website'
  | 'repository'
  | 'registry'
  | 'onchain';

const PRESS: Record<string, string> = {
  'theblock.co': 'The Block',
  'coindesk.com': 'CoinDesk',
  'decrypt.co': 'Decrypt',
  'blockworks.co': 'Blockworks',
  'cointelegraph.com': 'Cointelegraph',
  'techcrunch.com': 'TechCrunch',
  'bloomberg.com': 'Bloomberg',
  'reuters.com': 'Reuters',
  'fortune.com': 'Fortune',
  'forbes.com': 'Forbes',
  'businesswire.com': 'Business Wire',
  'prnewswire.com': 'PR Newswire',
  'globenewswire.com': 'GlobeNewswire',
  'axios.com': 'Axios',
  'wsj.com': 'The Wall Street Journal',
  'ft.com': 'Financial Times',
  'cnbc.com': 'CNBC',
  'theinformation.com': 'The Information',
  'dlnews.com': 'DL News',
  'unchainedcrypto.com': 'Unchained',
  'thedefiant.io': 'The Defiant',
  'coinbureau.com': 'Coin Bureau',
  'finsmes.com': 'FinSMEs',
  'venturebeat.com': 'VentureBeat',
  'siliconangle.com': 'SiliconANGLE',
};

const SOCIAL: Record<string, string> = {
  'twitter.com': 'X',
  'x.com': 'X',
  'warpcast.com': 'Warpcast',
  'linkedin.com': 'LinkedIn',
  't.me': 'Telegram',
  'discord.com': 'Discord',
  'discord.gg': 'Discord',
  'youtube.com': 'YouTube',
};

const ANNOUNCEMENT_HOSTS: Record<string, string> = {
  'medium.com': 'Medium',
  'mirror.xyz': 'Mirror',
  'substack.com': 'Substack',
  'paragraph.xyz': 'Paragraph',
  'notion.site': 'Notion',
  'hackmd.io': 'HackMD',
};

const DATABASES: Record<string, string> = {
  'defillama.com': 'DefiLlama',
  'llama.fi': 'DefiLlama',
  'crunchbase.com': 'Crunchbase',
  'cryptorank.io': 'CryptoRank',
  'messari.io': 'Messari',
  'dealroom.co': 'Dealroom',
  'pitchbook.com': 'PitchBook',
};

const ONCHAIN: Record<string, string> = {
  'solscan.io': 'Solscan',
  'explorer.solana.com': 'Solana Explorer',
  'solana.fm': 'SolanaFM',
  'xray.helius.xyz': 'XRAY',
  'orb.helius.dev': 'Orb',
};

/** The registrable part of a hostname, near enough: the last two labels, or three for `co.uk`-style hosts. */
function baseDomain(host: string): string {
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const twoLevel = /^(co|com|org|net|gov|ac)\.[a-z]{2}$/.test(parts.slice(-2).join('.'));
  return parts.slice(twoLevel ? -3 : -2).join('.');
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

const TRACKING = /^(utm_[a-z]+|ref|ref_src|ref_url|s|t|fbclid|gclid|mc_cid|mc_eid|source)$/i;

/** The URL with tracking parameters and fragments removed, for de-duplication. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    for (const key of [...u.searchParams.keys()])
      if (TRACKING.test(key)) u.searchParams.delete(key);
    if (u.hostname === 'twitter.com' || u.hostname === 'mobile.twitter.com') u.hostname = 'x.com';
    let out = u.toString();
    if (u.pathname !== '/' && out.endsWith('/') && !u.search) out = out.slice(0, -1);
    return out;
  } catch {
    return url.trim();
  }
}

export function classifySource(url: string): { kind: SourceKindGuess; publisher: string | null } {
  const host = hostOf(url);
  if (!host) return { kind: 'website', publisher: null };
  const base = baseDomain(host);
  const lookup = (table: Record<string, string>) => table[host] ?? table[base];

  if (host === 'sec.gov' || base === 'sec.gov') return { kind: 'filing', publisher: 'SEC' };
  if (lookup(ONCHAIN)) return { kind: 'onchain', publisher: lookup(ONCHAIN)! };
  if (lookup(PRESS)) return { kind: 'press', publisher: lookup(PRESS)! };
  if (lookup(SOCIAL)) return { kind: 'social', publisher: lookup(SOCIAL)! };
  if (lookup(DATABASES)) return { kind: 'database', publisher: lookup(DATABASES)! };
  if (lookup(ANNOUNCEMENT_HOSTS))
    return { kind: 'announcement', publisher: lookup(ANNOUNCEMENT_HOSTS)! };
  if (base === 'github.com' || base === 'gitlab.com')
    return { kind: 'repository', publisher: 'GitHub' };
  if (host.startsWith('blog.') || /\/(blog|news|posts?|announcements?)\//.test(url))
    return { kind: 'announcement', publisher: base };
  return { kind: 'website', publisher: base };
}
