import { defineAsset } from '../types';

export default defineAsset({
  id: 'usar',
  symbol: 'USAR',
  name: 'USA Rare Earth, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Materials', industry: 'Metals & Mining' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['copper', 'be'],
  summary:
    "A company building a domestic U.S. supply chain for rare-earth elements and magnets — critical inputs for EVs, defense systems, robotics and electronics that China currently dominates. It's a policy-driven strategic story: Western governments want to onshore these materials. Still early-stage and largely pre-revenue, so no P/E. Extremely sensitive to rare-earth prices, government support and trade tensions with China. A speculative bet on supply-chain reshoring.",
  hyperliquid: ['USAR'],
});
