import { defineAsset } from '../types';

export default defineAsset({
  id: 'brentoil',
  symbol: 'BRENTOIL',
  name: 'Brent Crude Oil',
  assetClass: 'commodity',
  taxonomy: { sector: 'Commodity', industry: 'Energy' },
  country: null,
  peRatio: null,
  isPrivate: false,
  peers: ['cl'],
  summary:
    'The global seaborne crude benchmark, pricing roughly two-thirds of internationally traded oil. More exposed to geopolitical supply risk than WTI; the Brent-WTI spread is itself a widely traded relationship.',
  hyperliquid: ['BRENTOIL'],
});
