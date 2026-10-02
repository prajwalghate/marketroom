import { defineAsset } from '../types';

export default defineAsset({
  id: 'lrcx',
  symbol: 'LRCX',
  name: 'Lam Research Corporation',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Semiconductor Equipment' },
  country: 'US',
  peRatio: 25,
  isPrivate: false,
  peers: ['amat', 'asml'],
  summary:
    'A leading supplier of etch and deposition equipment, with particular strength in memory manufacturing. Its order book is one of the better leading indicators for the NAND and DRAM capex cycle.',
  hyperliquid: ['LRCX'],
});
