import { defineAsset } from '../types';

export default defineAsset({
  id: 'arm',
  symbol: 'ARM',
  name: 'Arm Holdings plc',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Semiconductors' },
  country: 'GB',
  peRatio: 90,
  isPrivate: false,
  peers: ['nvda', 'qcom'],
  summary:
    "The architecture underneath nearly every smartphone and, increasingly, data-center and AI chips. Arm doesn't make chips — it licenses processor designs and collects royalties, a high-margin, asset-light model that commands a premium valuation. Its energy-efficient designs are spreading from mobile into servers, PCs and automotive as power efficiency becomes decisive for AI. British-headquartered, majority-owned by SoftBank, traded here as a U.S.-listed ADS.",
  hyperliquid: ['ARM'],
});
