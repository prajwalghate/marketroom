import { defineAsset } from '../types';

export default defineAsset({
  id: 'nbis',
  symbol: 'NBIS',
  name: 'Nebius Group N.V.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Cloud & AI Infrastructure' },
  country: 'NL',
  peRatio: null,
  isPrivate: false,
  peers: ['crwv', 'iren', 'ncld'],
  summary:
    "An AI-cloud infrastructure company (the international business that emerged from the former Yandex, now Amsterdam-based) providing GPU clusters and full-stack tools for training and running AI models. Like CoreWeave, it's a fast-growing neocloud spending heavily to build capacity, so it's not yet profitable and has no meaningful P/E. A sizeable OI cap signals strong trader interest in AI-infrastructure exposure. Growth-and-capex driven; benefits directly from AI compute demand in Europe and beyond.",
  hyperliquid: ['NBIS'],
});
