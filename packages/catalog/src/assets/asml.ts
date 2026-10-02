import { defineAsset } from '../types';

export default defineAsset({
  id: 'asml',
  symbol: 'ASML',
  name: 'ASML Holding N.V.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Semiconductor Equipment' },
  country: 'NL',
  peRatio: 35,
  isPrivate: false,
  peers: ['amat', 'lrcx', 'tsm'],
  summary:
    'A genuine monopoly at the heart of the chip world. ASML is the only company that makes extreme-ultraviolet (EUV) lithography machines — the room-sized tools required to print the most advanced chips. Every leading-edge fab (TSMC, Samsung, Intel) depends on it. That makes ASML both indispensable and a geopolitical lever, since export controls limit which countries can buy its machines. Dutch-listed; traded here via a U.S. ADR.',
  hyperliquid: ['ASML'],
});
