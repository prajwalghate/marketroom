import { defineAsset } from '../types';

export default defineAsset({
  id: 'rklb',
  symbol: 'RKLB',
  name: 'Rocket Lab Corporation',
  assetClass: 'equity',
  taxonomy: { sector: 'Industrials', industry: 'Aerospace & Defense' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['spcx'],
  summary:
    'A publicly traded space company positioned as the credible number-two to SpaceX. Rocket Lab flies its small Electron rocket, is developing the larger reusable Neutron to compete for bigger payloads, and builds satellites and spacecraft components — an end-to-end space business. Still investing heavily and not yet consistently profitable, so no meaningful P/E. A high-growth, high-risk pure-play on the commercial space economy; very sensitive to launch cadence and Neutron progress.',
  solana: [{ mint: 'XsKSh3QDynp6oms9yHjZXbZo3pKzUBoqUFKPHS2g9Bh', issuer: 'Backed Finance' }],
  hyperliquid: ['RKLB'],
});
