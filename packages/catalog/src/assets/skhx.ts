import { defineAsset } from '../types';

export default defineAsset({
  id: 'skhx',
  symbol: 'SKHX',
  name: 'SK hynix Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Memory & Storage' },
  country: 'KR',
  peRatio: 10,
  isPrivate: false,
  peers: ['mu', 'smsn', 'dram'],
  summary:
    "South Korea's memory champion and, crucially, the leading supplier of high-bandwidth memory (HBM) for AI accelerators — a position that made it one of the biggest single winners of the AI compute build-out. Like all memory makers it is cyclical, but HBM leadership has lifted margins and re-rated the story. Its large OI cap signals strong trader appetite. Priced in Korean won and converted to USD via oracle; low headline P/E is typical of the memory sector.",
  hyperliquid: ['SKHX'],
});
