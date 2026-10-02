import { defineAsset } from '../types';

export default defineAsset({
  id: 'purrdat',
  symbol: 'PURRDAT',
  name: 'Hyperliquid Strategies Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Financials', industry: 'Digital Asset Treasury' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['mstr', 'strc'],
  summary:
    "A digital-asset treasury company designed to give public-market investors exposure to HYPE, the native token of the Hyperliquid ecosystem — essentially a MicroStrategy-style vehicle, but for HYPE instead of Bitcoin. Its value tracks the tokens it holds, so a conventional P/E doesn't apply. A meta twist: it's a tokenized stock, trading on Hyperliquid, whose whole purpose is exposure to Hyperliquid's own token. High-beta and reflexive to HYPE's price.",
  hyperliquid: ['PURRDAT'],
});
