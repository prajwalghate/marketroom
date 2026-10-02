import { defineAsset } from '../types';

export default defineAsset({
  id: 'rivn',
  symbol: 'RIVN',
  name: 'Rivian Automotive, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Consumer Discretionary', industry: 'Automobiles' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['tsla', 'hyundai'],
  summary:
    "An American electric-vehicle maker focused on adventure trucks and SUVs, plus commercial delivery vans. Rivian has strong product reviews and a notable partnership and platform deal with Volkswagen, but it burns cash and isn't profitable, so it has no P/E. The stock hinges on ramping production, cutting costs and reaching its cheaper next-generation R2 model. A speculative EV growth play with real technology but real cash-runway risk.",
  hyperliquid: ['RIVN'],
});
