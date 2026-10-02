import { defineAsset } from '../types';

export default defineAsset({
  id: 'skhy',
  symbol: 'SKHY',
  name: 'SK hynix (secondary line)',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Memory & Storage' },
  country: 'KR',
  peRatio: 10,
  isPrivate: false,
  peers: ['skhx', 'mu'],
  summary:
    'A second SK hynix market line on the venue, alongside the primary SKHX listing. SK hynix is the leading supplier of HBM memory for AI accelerators.',
  solana: [{ mint: 'XsnhgGRQwhExfS2bmWzR6EYddKGPRGDEjeJsatkmKqU', issuer: 'Backed Finance' }],
  hyperliquid: ['SKHY'],
});
