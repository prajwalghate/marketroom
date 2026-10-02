import { defineAsset } from '../types';

export default defineAsset({
  id: 'cxmt',
  symbol: 'CXMT',
  name: 'ChangXin Memory Technologies',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Memory & Storage' },
  country: 'CN',
  peRatio: null,
  isPrivate: true,
  peers: ['mu', 'skhx', 'dram'],
  summary:
    "China's principal DRAM manufacturer and the main domestic challenger to the Samsung–SK hynix–Micron oligopoly. Its capacity ramp is one of the key variables in the memory cycle.",
  hyperliquid: ['CXMT'],
});
