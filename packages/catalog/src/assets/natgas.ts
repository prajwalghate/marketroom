import { defineAsset } from '../types';

export default defineAsset({
  id: 'natgas',
  symbol: 'NATGAS',
  name: 'Natural Gas (Henry Hub)',
  assetClass: 'commodity',
  taxonomy: { sector: 'Commodity', industry: 'Energy' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['ttf', 'cl'],
  summary:
    'The US natural gas benchmark. Notoriously volatile — weather, storage levels and LNG export capacity can move it double digits in a session.',
  hyperliquid: ['NATGAS'],
});
