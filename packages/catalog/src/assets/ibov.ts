import { defineAsset } from '../types';

export default defineAsset({
  id: 'ibov',
  symbol: 'IBOV',
  name: 'Ibovespa Index',
  assetClass: 'index',
  taxonomy: { sector: 'Index', industry: 'International Equity Index' },
  country: 'BR',
  peRatio: null,
  isPrivate: false,
  peers: ['ewz'],
  summary:
    "Brazil's headline equity index, concentrated in commodity producers and banks. Tends to track iron ore, oil and the real, making it a high-beta proxy for emerging-market commodity sentiment.",
  hyperliquid: ['IBOV'],
});
