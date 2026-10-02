import { defineAsset } from '../types';

export default defineAsset({
  id: 'strc',
  symbol: 'STRC',
  name: "Strategy 'Stretch' Preferred",
  assetClass: 'equity',
  taxonomy: { sector: 'Financials', industry: 'Digital Asset Treasury' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['mstr', 'purrdat'],
  summary:
    "A variable-rate perpetual preferred share issued by Strategy (formerly MicroStrategy) as part of its Bitcoin-treasury financing. Unlike the common stock, 'Stretch' pays cumulative cash dividends at a rate adjusted to keep its price near its $100 stated value — behaving more like a yield instrument than a growth stock. Being preferred equity, it has no P/E. This is a niche market for traders who want exposure to Strategy's capital structure rather than a direct Bitcoin bet.",
  hyperliquid: ['STRC'],
});
