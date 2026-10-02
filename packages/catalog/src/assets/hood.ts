import { defineAsset } from '../types';

export default defineAsset({
  id: 'hood',
  symbol: 'HOOD',
  name: 'Robinhood Markets, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Financials', industry: 'Capital Markets' },
  country: 'US',
  peRatio: 50,
  isPrivate: false,
  peers: ['coin', 'dkng'],
  summary:
    "The app that mainstreamed commission-free trading for a younger generation, now a broadening fintech spanning stocks, options, crypto, retirement and cash management. Robinhood's revenue is tied to trading activity, crypto volumes and interest income, making it a high-beta play on retail engagement. It has pushed aggressively into crypto and tokenization itself. Profitable and growing, but its fortunes rise and fall with market enthusiasm and rates.",
  hyperliquid: ['HOOD'],
  solana: [{ mint: 'XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg', issuer: 'Backed Finance' }],
});
