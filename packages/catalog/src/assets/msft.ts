import { defineAsset } from '../types';

export default defineAsset({
  id: 'msft',
  symbol: 'MSFT',
  name: 'Microsoft Corporation',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Software' },
  country: 'US',
  peRatio: 34,
  isPrivate: false,
  peers: ['googl', 'amzn', 'orcl'],
  summary:
    'A software giant reshaped into an AI-and-cloud powerhouse. Azure is the growth engine, Microsoft 365 and Windows are the cash base, and a deep partnership with OpenAI put Copilot across the entire product line. Enterprise lock-in is formidable and margins are elite. The debate centers on how quickly AI features convert into durable revenue versus the heavy capital spending on data centers required to serve them. Among the steadiest mega-caps, which is why it carries a high OI cap here.',
  hyperliquid: ['MSFT'],
  solana: [{ mint: 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX', issuer: 'Backed Finance' }],
});
