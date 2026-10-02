import { defineAsset } from '../types';

export default defineAsset({
  id: 'ttf',
  symbol: 'TTF',
  name: 'Dutch TTF Natural Gas',
  assetClass: 'commodity',
  taxonomy: { sector: 'Commodity', industry: 'Energy' },
  country: null,
  peRatio: null,
  isPrivate: false,
  peers: ['natgas'],
  summary:
    "The European gas benchmark, and the price that defined the continent's 2022 energy crisis. Driven by LNG import competition, storage levels and winter weather.",
  hyperliquid: ['TTF'],
});
