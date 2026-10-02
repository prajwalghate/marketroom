import { defineAsset } from '../types';

export default defineAsset({
  id: 'ho',
  symbol: 'HO',
  name: 'Heating Oil',
  assetClass: 'commodity',
  taxonomy: { sector: 'Commodity', industry: 'Energy' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['cl'],
  summary:
    'A refined distillate contract that also serves as a proxy for diesel. The crack spread against crude is a direct read on refining margins.',
  hyperliquid: ['HO'],
});
