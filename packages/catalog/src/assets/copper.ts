import { defineAsset } from '../types';

export default defineAsset({
  id: 'copper',
  symbol: 'COPPER',
  name: 'Copper',
  assetClass: 'commodity',
  taxonomy: { sector: 'Commodity', industry: 'Base Metals' },
  country: null,
  peRatio: null,
  isPrivate: false,
  peers: ['aluminium'],
  summary:
    'Known as "Dr. Copper" for its read on global industrial health. Structural demand from electrification, grid build-out and data centres is colliding with a thin mine-supply pipeline.',
  hyperliquid: ['COPPER'],
});
