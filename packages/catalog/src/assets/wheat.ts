import { defineAsset } from '../types';

export default defineAsset({
  id: 'wheat',
  symbol: 'WHEAT',
  name: 'Wheat',
  assetClass: 'commodity',
  taxonomy: { sector: 'Commodity', industry: 'Agriculture' },
  country: null,
  peRatio: null,
  isPrivate: false,
  peers: ['corn'],
  summary:
    'A global food staple with supply concentrated in a handful of exporting regions, which makes it unusually sensitive to conflict and export restrictions.',
  hyperliquid: ['WHEAT'],
});
