import { defineAsset } from '../types';

export default defineAsset({
  id: 'corn',
  symbol: 'CORN',
  name: 'Corn',
  assetClass: 'commodity',
  taxonomy: { sector: 'Commodity', industry: 'Agriculture' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['wheat'],
  summary:
    'The largest US grain crop, used for feed, ethanol and food. Driven by planting acreage, weather in the Midwest and export demand.',
  hyperliquid: ['CORN'],
});
