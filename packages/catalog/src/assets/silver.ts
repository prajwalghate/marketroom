import { defineAsset } from '../types';

export default defineAsset({
  id: 'silver',
  symbol: 'SILVER',
  name: 'Silver',
  assetClass: 'commodity',
  taxonomy: { sector: 'Commodity', industry: 'Precious Metals' },
  country: null,
  peRatio: null,
  isPrivate: false,
  peers: ['gold'],
  summary:
    'Both a precious and an industrial metal — roughly half of demand is industrial, much of it solar. That dual role makes silver more volatile than gold and more sensitive to the manufacturing cycle.',
  hyperliquid: ['SILVER'],
});
