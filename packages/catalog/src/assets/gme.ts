import { defineAsset } from '../types';

export default defineAsset({
  id: 'gme',
  symbol: 'GME',
  name: 'GameStop Corp.',
  assetClass: 'equity',
  taxonomy: { sector: 'Consumer Discretionary', industry: 'Retail' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['cost', 'ebay'],
  summary:
    "The video-game retailer turned meme-stock icon of 2021. GameStop's physical retail business is in secular decline, but it holds a large cash and (increasingly) crypto treasury, and its stock trades far more on retail-community sentiment than fundamentals. Earnings are minimal, so any P/E is distorted. Expect sharp, sentiment-driven moves detached from the underlying business — a favorite of leveraged, momentum-driven traders.",
  solana: [{ mint: 'Xsf9mBktVB9BSU5kf4nHxPq5hCBJ2j2ui3ecFGxPRGc', issuer: 'Backed Finance' }],
  hyperliquid: ['GME'],
});
