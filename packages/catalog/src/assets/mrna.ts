import { defineAsset } from '../types';

export default defineAsset({
  id: 'mrna',
  symbol: 'MRNA',
  name: 'Moderna, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Health Care', industry: 'Biotechnology' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['lly', 'xbi'],
  summary:
    'An mRNA biotechnology company that scaled dramatically during the pandemic and has since faced collapsing vaccine demand. The investment case now rests on whether its mRNA platform delivers in oncology and other indications.',
  hyperliquid: ['MRNA'],
});
