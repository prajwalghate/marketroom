import { defineAsset } from '../types';

export default defineAsset({
  id: 'xbi',
  symbol: 'XBI',
  name: 'SPDR S&P Biotech ETF',
  assetClass: 'etf',
  taxonomy: { sector: 'ETF', industry: 'Sector ETF' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['mrna', 'lly'],
  summary:
    'Equal-weighted US biotech, which tilts it toward small and mid-cap drug developers. Highly sensitive to interest rates and clinical-trial outcomes, making it one of the more volatile sector ETFs.',
  hyperliquid: ['XBI'],
});
