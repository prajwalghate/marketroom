import { defineAsset } from '../types';

export default defineAsset({
  id: 'mu',
  symbol: 'MU',
  name: 'Micron Technology, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Memory & Storage' },
  country: 'US',
  peRatio: 20,
  isPrivate: false,
  peers: ['skhx', 'smsn', 'dram'],
  summary:
    "One of the few makers of DRAM and NAND memory, and a direct beneficiary of the AI boom through high-bandwidth memory (HBM) used alongside AI GPUs. Memory is deeply cyclical, so Micron's earnings and P/E swing with supply-demand — cheap at the top of the cycle, expensive at the bottom. Its large $500m OI cap reflects heavy trader interest as an AI-adjacent, high-beta play. Watch HBM capacity, pricing, and the broader memory cycle.",
  hyperliquid: ['MU'],
});
