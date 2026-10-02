import { defineAsset } from '../types';

export default defineAsset({
  id: 'vol',
  symbol: 'VOL',
  name: 'Volatility Index',
  assetClass: 'index',
  taxonomy: { sector: 'Index', industry: 'Volatility' },
  country: null,
  peRatio: null,
  isPrivate: false,
  peers: ['vix'],
  summary:
    'A volatility benchmark market on the venue, used to take direct exposure to market turbulence rather than to price direction.',
  hyperliquid: ['VOL'],
});
