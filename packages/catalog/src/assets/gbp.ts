import { defineAsset } from '../types';

export default defineAsset({
  id: 'gbp',
  symbol: 'GBP',
  name: 'British Pound / US Dollar',
  assetClass: 'fx',
  taxonomy: { sector: 'Currency', industry: 'Major FX' },
  country: 'GB',
  peRatio: null,
  isPrivate: false,
  peers: ['eur', 'dxy'],
  summary:
    'Sterling against the dollar, "cable". Sensitive to Bank of England policy and UK fiscal credibility — the 2022 gilt crisis showed how fast that repricing can happen.',
  hyperliquid: ['GBP'],
});
