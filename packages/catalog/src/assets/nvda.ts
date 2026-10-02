import { defineAsset } from '../types';

export default defineAsset({
  id: 'nvda',
  symbol: 'NVDA',
  name: 'NVIDIA Corporation',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Semiconductors' },
  country: 'US',
  peRatio: 50,
  isPrivate: false,
  peers: ['amd', 'avgo', 'tsm', 'smh'],
  summary:
    "The defining chipmaker of the AI era. NVIDIA's GPUs and CUDA software stack power the vast majority of large-scale AI training and inference, and its data-center segment dwarfs its legacy gaming business. Explosive earnings growth has made it one of the most valuable companies on earth. Its $500m OI cap — the largest of any single stock here — reflects how heavily traders lean on it. Bulls cite an entrenched software moat and insatiable compute demand; bears watch for custom-silicon competition, export controls, and any sign the AI capex cycle is cooling.",
  hyperliquid: ['NVDA'],
  solana: [{ mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', issuer: 'Backed Finance' }],
});
