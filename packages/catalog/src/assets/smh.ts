import { defineAsset } from '../types';

export default defineAsset({
  id: 'smh',
  symbol: 'SMH',
  name: 'VanEck Semiconductor ETF',
  assetClass: 'etf',
  taxonomy: { sector: 'ETF', industry: 'Sector ETF' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['nvda', 'tsm', 'soxl'],
  summary:
    'Concentrated exposure to the largest semiconductor companies, led by NVIDIA and TSMC. A single-ticket way to trade the AI hardware cycle without picking an individual winner.',
  hyperliquid: ['SMH'],
});
