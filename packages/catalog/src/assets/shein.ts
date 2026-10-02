import { defineAsset } from '../types';

export default defineAsset({
  id: 'shein',
  symbol: 'SHEIN',
  name: 'Shein Group Ltd.',
  assetClass: 'equity',
  taxonomy: { sector: 'Consumer Discretionary', industry: 'E-commerce' },
  country: 'SG',
  peRatio: null,
  isPrivate: true,
  peers: ['baba', 'ebay'],
  summary:
    'An ultra-fast-fashion retailer built on an on-demand supply chain that compresses design-to-delivery to days. Private, with a long-rumoured listing and persistent regulatory and labour scrutiny.',
  hyperliquid: ['SHEIN'],
});
