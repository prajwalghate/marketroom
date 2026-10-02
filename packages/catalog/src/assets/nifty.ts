import { defineAsset } from '../types';

export default defineAsset({
  id: 'nifty',
  symbol: 'NIFTY',
  name: 'Nifty 50 Index',
  assetClass: 'index',
  taxonomy: { sector: 'Index', industry: 'International Equity Index' },
  country: 'IN',
  peRatio: null,
  isPrivate: false,
  peers: ['sp500'],
  summary:
    "India's benchmark index of 50 large-cap NSE-listed companies, weighted toward financials and IT services. A direct way to express a view on one of the fastest-growing major economies.",
  hyperliquid: ['NIFTY'],
});
