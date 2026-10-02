import { defineAsset } from '../types';

export default defineAsset({
  id: 'zm',
  symbol: 'ZM',
  name: 'Zoom Communications, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Software' },
  country: 'US',
  peRatio: 20,
  isPrivate: false,
  peers: ['now', 'net'],
  summary:
    'The video-meetings company that defined the pandemic era, now a profitable, cash-rich business hunting for growth beyond its core. Zoom is expanding into a broader collaboration suite — chat, phone, contact center and AI assistants — as meeting growth matured. A modest P/E reflects that transition. Notably, Zoom was an early strategic investor in Anthropic. The question is whether AI features and new products re-accelerate a stalled growth story.',
  hyperliquid: ['ZM'],
});
