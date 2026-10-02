import { defineAsset } from '../types';

export default defineAsset({
  id: 'tlt',
  symbol: 'TLT',
  name: 'iShares 20+ Year Treasury Bond ETF',
  assetClass: 'etf',
  taxonomy: { sector: 'ETF', industry: 'Fixed Income ETF' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['sp500'],
  summary:
    'Long-dated US Treasuries, and the cleanest liquid proxy for long-end interest rates. Its price moves inversely to yields, making it the standard instrument for expressing a duration view.',
  hyperliquid: ['TLT'],
});
