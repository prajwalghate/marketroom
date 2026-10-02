import { defineAsset } from '../types';

export default defineAsset({
  id: 'kstr',
  symbol: 'KSTR',
  name: 'Kuaishou Technology',
  assetClass: 'equity',
  taxonomy: { sector: 'Communication Services', industry: 'Interactive Media' },
  country: 'CN',
  peRatio: 15,
  isPrivate: false,
  peers: ['meta', 'rddt'],
  summary:
    'A Chinese short-video and live-streaming platform, the main domestic rival to Douyin, with a large live-commerce business and its own video generation models.',
  hyperliquid: ['KSTR'],
});
