import { defineAsset } from '../types';

export default defineAsset({
  id: 'bx',
  symbol: 'BX',
  name: 'Blackstone Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Financials', industry: 'Asset Management' },
  country: 'US',
  peRatio: 40,
  isPrivate: false,
  peers: ['crcl', 'hood'],
  summary:
    "The world's largest alternative-asset manager, overseeing enormous pools of private equity, real estate, credit and infrastructure capital. Blackstone earns management fees plus performance fees, so its earnings scale with assets and deal activity but can be lumpy. It's a bellwether for private markets and, increasingly, for financing the AI data-center build-out. Rate-sensitive: cheaper capital fuels dealmaking and real-estate values. A blue-chip way to hold private-markets exposure.",
  hyperliquid: ['BX'],
});
