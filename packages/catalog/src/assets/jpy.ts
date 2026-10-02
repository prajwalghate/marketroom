import { defineAsset } from '../types';

export default defineAsset({
  id: 'jpy',
  symbol: 'JPY',
  name: 'Japanese Yen / US Dollar',
  assetClass: 'fx',
  taxonomy: { sector: 'Currency', industry: 'Major FX' },
  country: 'JP',
  peRatio: null,
  isPrivate: false,
  peers: ['jp225', 'dxy'],
  summary:
    'A traditional funding currency and haven. Decades of ultra-low Japanese rates made the yen the leg of the global carry trade, so unwinds can be violent and spill into equities.',
  hyperliquid: ['JPY'],
});
