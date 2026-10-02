import { defineAsset } from '../types';

export default defineAsset({
  id: 'crwv',
  symbol: 'CRWV',
  name: 'CoreWeave, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Cloud & AI Infrastructure' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['nbis', 'iren', 'ncld'],
  summary:
    "A specialized 'neocloud' that rents out GPU compute optimized for AI training and inference — effectively a picks-and-shovels landlord for the AI boom. CoreWeave grew explosively on huge contracts with AI labs and hyperscalers, but funds its GPU build-out with heavy debt and posts losses, so it has no P/E. The bull case is soaring AI-compute demand; the bear case is customer concentration, debt load and the risk of a GPU-capacity glut. Very high-beta.",
  solana: [{ mint: 'Xs3trfdPXSZuxBJsgau6HRfu8SdrCirkwHpPNgSpJz9', issuer: 'Backed Finance' }],
  hyperliquid: ['CRWV'],
});
