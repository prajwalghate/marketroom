import { defineAsset } from '../types';

export default defineAsset({
  id: 'wdc',
  symbol: 'WDC',
  name: 'Western Digital Corporation',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Memory & Storage' },
  country: 'US',
  peRatio: 15,
  isPrivate: false,
  peers: ['sndk', 'kioxia'],
  summary:
    'A storage maker focused on hard-disk drives for the mass-capacity data-center market. As AI generates vast quantities of data that must be stored cheaply, demand for high-capacity drives has firmed. Storage is cyclical and lower-margin than compute, hence a modest P/E. Western Digital separated its flash-memory business (now Sandisk), leaving it a cleaner HDD play. Watch data-center capacity demand and drive pricing.',
  hyperliquid: ['WDC'],
});
