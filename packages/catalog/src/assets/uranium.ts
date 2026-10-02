import { defineAsset } from '../types';

export default defineAsset({
  id: 'uranium',
  symbol: 'URANIUM',
  name: 'Uranium',
  assetClass: 'commodity',
  taxonomy: { sector: 'Commodity', industry: 'Energy' },
  country: null,
  peRatio: null,
  isPrivate: false,
  peers: ['urnm'],
  summary:
    'Nuclear fuel, traded in a thin and opaque market historically dominated by long-term utility contracts. Renewed interest is driven by decarbonisation and by data-centre power demand.',
  hyperliquid: ['URANIUM'],
});
