import { defineAsset } from '../types';

export default defineAsset({
  id: 'hims',
  symbol: 'HIMS',
  name: 'Hims & Hers Health, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Health Care', industry: 'Health Care Services' },
  country: 'US',
  peRatio: 60,
  isPrivate: false,
  peers: ['lly', 'oura'],
  summary:
    "A direct-to-consumer digital-health platform offering telehealth consultations, prescriptions and wellness products for things like weight management, hair loss, sexual health and mental health. Hims rode the compounded-GLP-1 weight-loss wave and built a fast-growing subscription business with strong brand marketing. It's profitable and growing quickly, which supports a premium P/E. Risks include regulatory scrutiny of compounded drugs, competition, and reliance on marketing spend. A high-growth consumer-health name and a favorite of momentum traders.",
  hyperliquid: ['HIMS'],
});
