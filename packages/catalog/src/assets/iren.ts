import { defineAsset } from '../types';

export default defineAsset({
  id: 'iren',
  symbol: 'IREN',
  name: 'IREN Limited',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Cloud & AI Infrastructure' },
  country: 'AU',
  peRatio: null,
  isPrivate: false,
  peers: ['crwv', 'bmnr'],
  summary:
    'A bitcoin miner that has pivoted toward AI data-centre hosting, converting power-dense sites into GPU capacity. Its value rests on secured grid connections — the scarcest input in AI infrastructure.',
  hyperliquid: ['IREN'],
});
