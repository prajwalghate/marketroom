import { defineAsset } from '../types';

export default defineAsset({
  id: 'intc',
  symbol: 'INTC',
  name: 'Intel Corporation',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Semiconductors' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['amd', 'nvda', 'tsm'],
  summary:
    'The former CPU king in the middle of a costly turnaround. Intel is pouring capital into its foundry ambitions to manufacture chips for others and reclaim process leadership from TSMC, while defending its data-center and PC franchises against AMD and Arm. Heavy spending and restructuring have compressed or erased profits, so a clean P/E is hard to pin down. A high-stakes bet: succeed at foundry and it re-rates; stumble and the cash burn bites. Politically important as a U.S. manufacturing champion.',
  solana: [{ mint: 'XshPgPdXFRWB8tP1j82rebb2Q9rPgGX37RuqzohmArM', issuer: 'Backed Finance' }],
  hyperliquid: ['INTC'],
});
