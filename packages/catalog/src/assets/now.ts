import { defineAsset } from '../types';

export default defineAsset({
  id: 'now',
  symbol: 'NOW',
  name: 'ServiceNow, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Software' },
  country: 'US',
  peRatio: 110,
  isPrivate: false,
  peers: ['pltr', 'snxx'],
  summary:
    "A workflow-automation platform that has become core plumbing for large enterprises' IT, HR and operations. ServiceNow is layering AI agents across its platform, a natural fit for automating repetitive corporate work. High retention, strong margins and reliable growth earn it a premium P/E. The debate is whether AI agents expand its market or eventually commoditize the workflows it sells. A steady large-cap software compounder.",
  hyperliquid: ['NOW'],
});
