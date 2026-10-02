import { defineAsset } from '../types';

export default defineAsset({
  id: 'qnt',
  symbol: 'QNT',
  name: 'Quantinuum Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Emerging Compute' },
  country: 'US',
  peRatio: null,
  isPrivate: true,
  peers: ['lyte', 'cbrs'],
  summary:
    "A leading quantum-computing company built from Honeywell Quantum Solutions and Cambridge Quantum, developing trapped-ion quantum computers and quantum software. It's one of the most advanced players in a field that could eventually break current cryptography and transform chemistry and optimization — but commercial quantum advantage is still years out. Private and pre-IPO, so no public earnings or P/E. This market offers rare synthetic exposure to a name most investors can't otherwise access.",
  hyperliquid: ['QNT'],
});
