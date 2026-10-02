import { defineAsset } from '../types';

export default defineAsset({
  id: 'aluminium',
  symbol: 'ALUMINIUM',
  name: 'Aluminium',
  assetClass: 'commodity',
  taxonomy: { sector: 'Commodity', industry: 'Base Metals' },
  country: null,
  peRatio: null,
  isPrivate: false,
  peers: ['copper'],
  summary:
    'An energy-intensive base metal — smelting economics track power prices closely, so aluminium often trades as a derivative of energy costs as much as of industrial demand.',
  hyperliquid: ['ALUMINIUM'],
});
