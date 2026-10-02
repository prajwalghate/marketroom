import { defineAsset } from '../types';

export default defineAsset({
  id: 'umc',
  symbol: 'UMC',
  name: 'United Microelectronics Corp.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Semiconductors' },
  country: 'TW',
  peRatio: 14,
  isPrivate: false,
  peers: ['tsm'],
  summary:
    "Taiwan's second foundry, specialising in mature-node manufacturing rather than competing at the leading edge. Exposed to automotive and consumer chip demand and to Chinese mature-node competition.",
  hyperliquid: ['UMC'],
});
