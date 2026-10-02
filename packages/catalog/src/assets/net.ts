import { defineAsset } from '../types';

export default defineAsset({
  id: 'net',
  symbol: 'NET',
  name: 'Cloudflare, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Cloud & AI Infrastructure' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['crwd', 'crwv'],
  summary:
    'An edge network sitting in front of a large share of the web, providing CDN, DDoS protection and zero-trust security. It has pushed aggressively into edge compute and inference, positioning itself as infrastructure for distributed AI workloads.',
  hyperliquid: ['NET'],
});
