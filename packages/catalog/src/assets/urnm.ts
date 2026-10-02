import { defineAsset } from '../types';

export default defineAsset({
  id: 'urnm',
  symbol: 'URNM',
  name: 'Sprott Uranium Miners ETF',
  assetClass: 'etf',
  taxonomy: { sector: 'ETF', industry: 'Thematic ETF' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['uranium'],
  summary:
    'Uranium miners and physical uranium holdings. A levered play on nuclear power demand — including the growing argument that AI data-centre load needs baseload nuclear generation.',
  hyperliquid: ['URNM'],
});
