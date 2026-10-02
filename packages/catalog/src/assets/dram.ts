import { defineAsset } from '../types';

export default defineAsset({
  id: 'dram',
  symbol: 'DRAM',
  name: 'DRAM Spot Price Index',
  assetClass: 'index',
  taxonomy: { sector: 'Index', industry: 'Commodity Index' },
  country: null,
  peRatio: null,
  isPrivate: false,
  peers: ['mu', 'skhx', 'cxmt'],
  summary:
    'A spot price benchmark for DRAM memory chips. Memory is genuinely commodity-like and deeply cyclical, and this gives direct exposure to that cycle without taking single-company risk.',
  hyperliquid: ['DRAM'],
});
