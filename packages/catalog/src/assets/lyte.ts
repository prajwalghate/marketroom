import { defineAsset } from '../types';

export default defineAsset({
  id: 'lyte',
  symbol: 'LYTE',
  name: 'Lightmatter, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Emerging Compute' },
  country: 'US',
  peRatio: null,
  isPrivate: true,
  peers: ['qnt', 'lite'],
  summary:
    'A photonic computing company using light rather than electrons for chip interconnect, targeting the bandwidth and power limits of large AI clusters. Private and pre-revenue at scale.',
  hyperliquid: ['LYTE'],
});
