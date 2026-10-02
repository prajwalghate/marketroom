import { defineAsset } from '../types';

export default defineAsset({
  id: 'h100',
  symbol: 'H100',
  name: 'NVIDIA H100 GPU Price Index',
  assetClass: 'index',
  taxonomy: { sector: 'Index', industry: 'Commodity Index' },
  country: null,
  peRatio: null,
  isPrivate: false,
  peers: ['nvda', 'crwv'],
  summary:
    'A price benchmark for H100 GPU rental or spot capacity — effectively the unit cost of AI compute. One of the more novel markets in the book, turning compute scarcity itself into a tradable instrument.',
  hyperliquid: ['H100'],
});
