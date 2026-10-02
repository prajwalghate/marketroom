import { defineAsset } from '../types';

export default defineAsset({
  id: 'glw',
  symbol: 'GLW',
  name: 'Corning Incorporated',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Communications Equipment' },
  country: 'US',
  peRatio: 25,
  isPrivate: false,
  peers: ['aaoi', 'lite'],
  summary:
    'A materials science company making display glass, Gorilla Glass and optical fibre. The optical communications segment has become the growth story as AI data centres consume enormous quantities of fibre.',
  solana: [{ mint: 'Xsg3UgvjxpUgV3WZx9Wt9deLx7qvKYp6ZLY6xMY2Dfq', issuer: 'Backed Finance' }],
  hyperliquid: ['GLW'],
});
