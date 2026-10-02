import { defineAsset } from '../types';

export default defineAsset({
  id: 'cl',
  symbol: 'CL',
  name: 'WTI Crude Oil',
  assetClass: 'commodity',
  taxonomy: { sector: 'Commodity', industry: 'Energy' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['brentoil', 'xle'],
  summary:
    'West Texas Intermediate, the US crude benchmark priced at Cushing, Oklahoma. One of the highest-volume markets on the venue and the reference price for North American oil.',
  hyperliquid: ['CL'],
});
