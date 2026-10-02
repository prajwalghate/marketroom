import { defineAsset } from '../types';

export default defineAsset({
  id: 'snxx',
  symbol: 'SNXX',
  name: 'Synopsys Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Software' },
  country: 'US',
  peRatio: 45,
  isPrivate: false,
  peers: ['now', 'arm'],
  summary:
    'The dominant electronic design automation vendor. Every advanced chip is designed in software like this, giving it a toll-booth position across the entire semiconductor industry.',
  hyperliquid: ['SNXX'],
});
