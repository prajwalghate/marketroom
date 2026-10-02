import { defineAsset } from '../types';

export default defineAsset({
  id: 'dxy',
  symbol: 'DXY',
  name: 'US Dollar Index',
  assetClass: 'fx',
  taxonomy: { sector: 'Currency', industry: 'FX Index' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['eur', 'jpy', 'gbp'],
  summary:
    'The dollar measured against a basket of six major currencies, dominated by the euro. A broad risk barometer: a rising DXY tightens global financial conditions and typically pressures commodities and emerging markets.',
  hyperliquid: ['DXY'],
});
