import { defineAsset } from '../types';

export default defineAsset({
  id: 'twst',
  symbol: 'TWST',
  name: 'Twist Bioscience Corporation',
  assetClass: 'equity',
  taxonomy: { sector: 'Health Care', industry: 'Life Sciences Tools' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['xbi'],
  summary:
    'A synthetic DNA manufacturer using a silicon-based platform to drive down the cost of writing DNA, serving drug discovery and DNA data storage research.',
  hyperliquid: ['TWST'],
});
