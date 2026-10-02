import { defineAsset } from '../types';

export default defineAsset({
  id: 'be',
  symbol: 'BE',
  name: 'Bloom Energy Corporation',
  assetClass: 'equity',
  taxonomy: { sector: 'Energy', industry: 'Renewable Energy' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['gev', 'usar'],
  summary:
    'A maker of solid-oxide fuel cells that generate on-site electricity for factories, hospitals and — increasingly — power-hungry AI data centers looking for fast, reliable capacity outside the strained grid. That data-center angle has driven renewed investor interest. Bloom hovers around breakeven, so its P/E is volatile or not meaningful. A leveraged bet on distributed power and the energy bottleneck behind the AI build-out; high-beta and news-driven.',
  hyperliquid: ['BE'],
});
