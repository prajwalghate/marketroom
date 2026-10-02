import { defineAsset } from '../types';

export default defineAsset({
  id: 'jp225',
  symbol: 'JP225',
  name: 'Nikkei 225 Index',
  assetClass: 'index',
  taxonomy: { sector: 'Index', industry: 'International Equity Index' },
  country: 'JP',
  peRatio: null,
  isPrivate: false,
  peers: ['ewj', 'softbank'],
  summary:
    "Japan's headline equity benchmark, a price-weighted index of 225 Tokyo-listed companies. Heavily influenced by exporters and semiconductor-equipment names, and closely tied to the yen — a weaker JPY typically flatters it.",
  hyperliquid: ['JP225'],
});
