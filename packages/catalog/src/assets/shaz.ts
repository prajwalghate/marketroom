import { defineAsset } from '../types';

export default defineAsset({
  id: 'shaz',
  symbol: 'SHAZ',
  name: 'SharonAI Holdings Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Cloud & AI Infrastructure' },
  country: 'US/AU',
  peRatio: null,
  isPrivate: false,
  peers: ['crwv', 'nbis'],
  summary:
    "An early-stage 'neocloud' providing GPU and high-performance computing infrastructure for AI workloads, building data-center capacity across Australia and the United States. It plays the same picks-and-shovels theme as CoreWeave and Nebius but is smaller and newer, making it more speculative. No meaningful P/E given its early stage. Exposure to the AI-compute build-out at the riskier, higher-upside end of the spectrum — highly sensitive to funding, contracts and execution.",
  hyperliquid: ['SHAZ'],
});
