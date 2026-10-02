import { defineAsset } from '../types';

export default defineAsset({
  id: 'xle',
  symbol: 'XLE',
  name: 'Energy Select Sector SPDR',
  assetClass: 'etf',
  taxonomy: { sector: 'ETF', industry: 'Sector ETF' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['cvx', 'cl'],
  summary:
    'The large-cap US energy sector, dominated by integrated oil majors. Tracks crude prices with a lag and provides equity-flavoured energy exposure rather than direct commodity risk.',
  hyperliquid: ['XLE'],
});
