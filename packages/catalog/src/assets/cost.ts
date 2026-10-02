import { defineAsset } from '../types';

export default defineAsset({
  id: 'cost',
  symbol: 'COST',
  name: 'Costco Wholesale Corporation',
  assetClass: 'equity',
  taxonomy: { sector: 'Consumer Discretionary', industry: 'Retail' },
  country: 'US',
  peRatio: 55,
  isPrivate: false,
  peers: ['gme', 'ebay'],
  summary:
    "The membership warehouse retailer with cult-like customer loyalty and remarkably consistent growth. Costco makes much of its profit from membership fees, letting it sell goods at razor-thin margins that keep members renewing at very high rates. That reliability earns it a premium P/E rare for a retailer. It's a defensive compounder — steady traffic, pricing discipline and dependable dividends. The debate is simply whether the valuation is too rich for its growth rate.",
  hyperliquid: ['COST'],
});
