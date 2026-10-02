import { defineAsset } from '../types';

export default defineAsset({
  id: 'amzn',
  symbol: 'AMZN',
  name: 'Amazon.com, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Consumer Discretionary', industry: 'E-commerce' },
  country: 'US',
  peRatio: 34,
  isPrivate: false,
  peers: ['baba', 'msft', 'ebay'],
  summary:
    'Two businesses in one: a global e-commerce and logistics empire, and AWS — the cloud unit that generates most of the profit. AWS growth, AI services and its Anthropic partnership are the swing factors for the stock, while retail margins improve with advertising and automation. Amazon reinvests almost everything, so reported earnings understate cash generation. Watch cloud growth rates, capex discipline, and antitrust attention on its marketplace and logistics dominance.',
  hyperliquid: ['AMZN'],
  solana: [{ mint: 'Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg', issuer: 'Backed Finance' }],
});
