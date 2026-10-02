import { defineAsset } from '../types';

export default defineAsset({
  id: 'eur',
  symbol: 'EUR',
  name: 'Euro / US Dollar',
  assetClass: 'fx',
  taxonomy: { sector: 'Currency', industry: 'Major FX' },
  country: null,
  peRatio: null,
  isPrivate: false,
  peers: ['dxy', 'gbp'],
  summary:
    'The most traded currency pair in the world. Driven by the ECB–Fed policy differential and by European energy costs, and the dominant component of the dollar index.',
  hyperliquid: ['EUR'],
});
