import { defineAsset } from '../types';

export default defineAsset({
  id: 'spcx',
  symbol: 'SPCX',
  name: 'Space Exploration Technologies (SpaceX)',
  assetClass: 'equity',
  taxonomy: { sector: 'Industrials', industry: 'Aerospace & Defense' },
  country: 'US',
  peRatio: null,
  isPrivate: true,
  peers: ['rklb'],
  summary:
    "Elon Musk's private space company and one of the most valuable startups in history — the market its largest OI cap here reflects intense demand for exposure. SpaceX dominates commercial launch via reusable rockets, operates Starlink's global satellite-internet network, and wholly owns the AI company xAI. Because it's private, there's no public P/E or share price; this synthetic market is one of the only ways to trade SpaceX at all. Valuation-driven and headline-sensitive.",
  hyperliquid: ['SPCX'],
});
