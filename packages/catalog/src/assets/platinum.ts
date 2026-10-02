import { defineAsset } from '../types';

export default defineAsset({
  id: 'platinum',
  symbol: 'PLATINUM',
  name: 'Platinum',
  assetClass: 'commodity',
  taxonomy: { sector: 'Commodity', industry: 'Precious Metals' },
  country: null,
  peRatio: null,
  isPrivate: false,
  peers: ['palladium', 'gold'],
  summary:
    'A precious metal with heavy autocatalyst demand, concentrated in South African supply. Its price is driven as much by mine disruption and vehicle emissions rules as by investment flows.',
  hyperliquid: ['PLATINUM'],
});
