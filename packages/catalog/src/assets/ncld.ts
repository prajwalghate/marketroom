import { defineAsset } from '../types';

export default defineAsset({
  id: 'ncld',
  symbol: 'NCLD',
  name: 'Nscale Global Holdings',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Cloud & AI Infrastructure' },
  country: 'GB',
  peRatio: null,
  isPrivate: true,
  peers: ['crwv', 'nbis'],
  summary:
    'A GPU cloud operator building out AI data-centre capacity with an emphasis on low-carbon power. Private, competing in the neocloud segment against CoreWeave and Nebius.',
  hyperliquid: ['NCLD'],
});
