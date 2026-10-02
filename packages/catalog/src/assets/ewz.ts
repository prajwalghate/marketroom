import { defineAsset } from '../types';

export default defineAsset({
  id: 'ewz',
  symbol: 'EWZ',
  name: 'iShares MSCI Brazil ETF',
  assetClass: 'etf',
  taxonomy: { sector: 'ETF', industry: 'Country ETF' },
  country: 'BR',
  peRatio: null,
  isPrivate: false,
  peers: ['ibov'],
  summary:
    'Brazilian large-caps in dollar terms, concentrated in commodities and banking. High beta to commodity prices and to the real.',
  hyperliquid: ['EWZ'],
});
