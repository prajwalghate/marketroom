import { defineAsset } from '../types';

export default defineAsset({
  id: 'lite',
  symbol: 'LITE',
  name: 'Lumentum Holdings Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Communications Equipment' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['aaoi', 'glw', 'nok'],
  summary:
    'A photonics company making the lasers and optical components that move data at light speed inside AI data centers and telecom networks. The AI networking boom has revived demand for its high-speed optical transceivers and chips. Earnings have been recovering from a cyclical trough, so its trailing P/E is either very high or not meaningful. A more niche, higher-beta way to play AI interconnect demand alongside Marvell and Broadcom.',
  hyperliquid: ['LITE'],
});
