import { defineAsset } from '../types';

export default defineAsset({
  id: 'ymtc',
  symbol: 'YMTC',
  name: 'Yangtze Memory Technologies',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Memory & Storage' },
  country: 'CN',
  peRatio: null,
  isPrivate: true,
  peers: ['mu', 'skhx'],
  summary:
    "China's leading NAND flash manufacturer, notable for its Xtacking architecture. Operating under US export restrictions, making its technology roadmap a geopolitical question as much as an engineering one.",
  hyperliquid: ['YMTC'],
});
