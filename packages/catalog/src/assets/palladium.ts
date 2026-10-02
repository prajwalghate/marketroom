import { defineAsset } from '../types';

export default defineAsset({
  id: 'palladium',
  symbol: 'PALLADIUM',
  name: 'Palladium',
  assetClass: 'commodity',
  taxonomy: { sector: 'Commodity', industry: 'Precious Metals' },
  country: null,
  peRatio: null,
  isPrivate: false,
  peers: ['platinum'],
  summary:
    'Primarily a gasoline-autocatalyst metal with highly concentrated Russian and South African supply. Thin liquidity and supply concentration make it prone to violent squeezes.',
  hyperliquid: ['PALLADIUM'],
});
