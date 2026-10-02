import { defineAsset } from '../types';

export default defineAsset({
  id: 'tsla',
  symbol: 'TSLA',
  name: 'Tesla, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Consumer Discretionary', industry: 'Automobiles' },
  country: 'US',
  peRatio: 290,
  isPrivate: false,
  peers: ['rivn', 'hyundai', 'bot'],
  summary:
    "An electric-vehicle maker the market prices as an AI and robotics company. Tesla leads Western EV production and energy storage, but its extreme valuation rests on future bets: full self-driving, the robotaxi network, and the Optimus humanoid robot. Earnings are modest relative to price, which is why its P/E sits in the hundreds. One of the most volatile large-caps in existence and a perennial favorite of leveraged traders — moves are amplified by Elon Musk's public profile, delivery numbers, and every incremental autonomy claim.",
  hyperliquid: ['TSLA'],
  solana: [{ mint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', issuer: 'Backed Finance' }],
});
