import { defineAsset } from '../types';

export default defineAsset({
  id: 'rddt',
  symbol: 'RDDT',
  name: 'Reddit, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Communication Services', industry: 'Interactive Media' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['meta'],
  summary:
    'A large social discussion platform whose archive of human-written conversation turned out to be valuable AI training data, producing substantial data-licensing revenue alongside advertising.',
  hyperliquid: ['RDDT'],
});
