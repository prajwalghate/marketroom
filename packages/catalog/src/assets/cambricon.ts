import { defineAsset } from '../types';

export default defineAsset({
  id: 'cambricon',
  symbol: 'CAMBRICON',
  name: 'Cambricon Technologies',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Semiconductors' },
  country: 'CN',
  peRatio: null,
  isPrivate: false,
  peers: ['cbrs', 'nvda'],
  summary:
    "A Chinese AI chip designer positioned as a domestic alternative to NVIDIA. Its prospects are tied directly to export controls and to Beijing's semiconductor self-sufficiency push.",
  hyperliquid: ['CAMBRICON'],
});
