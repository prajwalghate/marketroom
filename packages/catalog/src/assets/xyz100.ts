import { defineAsset } from '../types';

export default defineAsset({
  id: 'xyz100',
  symbol: 'XYZ100',
  name: 'XYZ 100 Index',
  assetClass: 'index',
  taxonomy: { sector: 'Index', industry: 'Thematic Index' },
  country: null,
  peRatio: null,
  isPrivate: false,
  peers: ['sp500'],
  summary:
    "The venue's own flagship basket index and, by 24h notional, the most actively traded market in the book. It offers broad exposure in a single position rather than requiring a basket of individual stock perps.",
  hyperliquid: ['XYZ100'],
});
