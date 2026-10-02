import { defineAsset } from '../types';

export default defineAsset({
  id: 'ebay',
  symbol: 'EBAY',
  name: 'eBay Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Consumer Discretionary', industry: 'E-commerce' },
  country: 'US',
  peRatio: 16,
  isPrivate: false,
  peers: ['baba', 'amzn'],
  summary:
    "The original online marketplace, now a mature, cash-generative business focused on used, refurbished and collectible goods rather than competing head-on with Amazon. eBay drives modest growth through 'focus categories,' advertising and payments, and returns cash via buybacks and dividends. A low P/E reflects slow growth and a value profile. Steady rather than exciting — a way to hold e-commerce exposure without a premium multiple.",
  hyperliquid: ['EBAY'],
});
