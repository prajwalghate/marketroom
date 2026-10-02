import { defineAsset } from '../types';

export default defineAsset({
  id: 'gold',
  symbol: 'GOLD',
  name: 'Gold',
  assetClass: 'commodity',
  taxonomy: { sector: 'Commodity', industry: 'Precious Metals' },
  country: null,
  peRatio: null,
  isPrivate: false,
  peers: ['silver', 'platinum'],
  summary:
    'The oldest monetary asset and the default haven. Gold responds to real interest rates, the dollar and central-bank buying rather than to industrial demand, which is what makes it a genuine portfolio diversifier.',
  hyperliquid: ['GOLD'],
  // NOTE: deliberately NOT mapped to the Solana SPYx / GLDx tokens.
  // Those track an ETF share, which is priced at roughly 1/10 of this
  // instrument. Treating them as the same asset produced a meaningless ~980%
  // "cross-venue spread". Different unit scale = different asset.
});
