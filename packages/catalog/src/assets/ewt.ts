import { defineAsset } from '../types';

export default defineAsset({
  id: 'ewt',
  symbol: 'EWT',
  name: 'iShares MSCI Taiwan ETF',
  assetClass: 'etf',
  taxonomy: { sector: 'ETF', industry: 'Country ETF' },
  country: 'TW',
  peRatio: null,
  isPrivate: false,
  peers: ['tsm'],
  summary:
    'Taiwanese equities, dominated by TSMC to the point that it trades largely as a TSMC proxy with added geopolitical risk premium.',
  hyperliquid: ['EWT'],
});
