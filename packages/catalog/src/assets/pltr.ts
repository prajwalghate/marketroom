import { defineAsset } from '../types';

export default defineAsset({
  id: 'pltr',
  symbol: 'PLTR',
  name: 'Palantir Technologies, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Software' },
  country: 'US',
  peRatio: 250,
  isPrivate: false,
  peers: ['crwd', 'now'],
  summary:
    'A data-analytics and AI-software company serving governments and, increasingly, commercial enterprises. Its platforms integrate messy data for decision-making, and its AI Platform (AIP) has driven a wave of commercial growth. Palantir inspires unusually strong retail devotion and carries one of the highest P/E ratios in the market — priced for years of rapid growth. Any deceleration or valuation reset can be violent. A high-beta, high-narrative AI stock.',
  solana: [{ mint: 'XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4', issuer: 'Backed Finance' }],
  hyperliquid: ['PLTR'],
});
