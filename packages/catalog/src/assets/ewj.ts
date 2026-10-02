import { defineAsset } from '../types';

export default defineAsset({
  id: 'ewj',
  symbol: 'EWJ',
  name: 'iShares MSCI Japan ETF',
  assetClass: 'etf',
  taxonomy: { sector: 'ETF', industry: 'Country ETF' },
  country: 'JP',
  peRatio: null,
  isPrivate: false,
  peers: ['jp225', 'softbank'],
  summary:
    'Broad Japanese equity exposure in dollars. Unhedged, so a weakening yen can offset local-currency equity gains — a dynamic that has repeatedly caught out foreign investors.',
  hyperliquid: ['EWJ'],
});
