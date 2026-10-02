import { defineAsset } from '../types';

export default defineAsset({
  id: 'aaoi',
  symbol: 'AAOI',
  name: 'Applied Optoelectronics, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Communications Equipment' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['lite', 'glw'],
  summary:
    'A supplier of optical transceivers for data-centre interconnect. Small and volatile, but directly levered to the optics build-out that AI cluster networking demands.',
  hyperliquid: ['AAOI'],
});
