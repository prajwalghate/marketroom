import { defineAsset } from '../types';

export default defineAsset({
  id: 'googl',
  symbol: 'GOOGL',
  name: 'Alphabet Inc. (Class A)',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Internet' },
  country: 'US',
  peRatio: 27,
  isPrivate: false,
  peers: ['meta', 'msft', 'amzn'],
  summary:
    "Google's parent and one of the cheapest mega-caps by P/E. Search and YouTube advertising fund everything, while Google Cloud has turned profitable and Gemini anchors its AI push. Waymo leads autonomous driving and DeepMind drives frontier research. The bear case is that AI chat could erode search dominance; the bull case is that Alphabet owns the models, the chips (TPUs), the cloud and the distribution. Ongoing antitrust cases are the main regulatory overhang.",
  hyperliquid: ['GOOGL'],
  solana: [{ mint: 'XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN', issuer: 'Backed Finance' }],
});
