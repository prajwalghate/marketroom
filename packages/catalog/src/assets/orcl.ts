import { defineAsset } from '../types';

export default defineAsset({
  id: 'orcl',
  symbol: 'ORCL',
  name: 'Oracle Corporation',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Software' },
  country: 'US',
  peRatio: 40,
  isPrivate: false,
  peers: ['msft', 'ibm'],
  summary:
    'A database and enterprise-software veteran enjoying an unexpected second act as an AI-cloud provider. Oracle Cloud Infrastructure has won large contracts to host AI training workloads, and its backlog of signed cloud commitments has surged, re-rating a once-sleepy stock. The bull case is a genuine fourth hyperscaler emerging; the bear case is the enormous capex and debt required to build it, plus customer concentration. Watch cloud backlog conversion and margins.',
  solana: [{ mint: 'XsjFwUPiLofddX5cWFHW35GCbXcSu1BCUGfxoQAQjeL', issuer: 'Backed Finance' }],
  hyperliquid: ['ORCL'],
});
