import { defineAsset } from '../types';

export default defineAsset({
  id: 'soxl',
  symbol: 'SOXL',
  name: 'Direxion Daily Semiconductor Bull 3X',
  assetClass: 'etf',
  taxonomy: { sector: 'ETF', industry: 'Leveraged ETF' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['smh', 'nvda'],
  summary:
    'A 3× daily leveraged semiconductor ETF. Because leverage resets daily, it decays in choppy markets and is a short-horizon trading instrument, not a hold — and trading it as a perp layers leverage on leverage.',
  hyperliquid: ['SOXL'],
});
