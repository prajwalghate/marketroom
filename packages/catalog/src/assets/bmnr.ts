import { defineAsset } from '../types';

export default defineAsset({
  id: 'bmnr',
  symbol: 'BMNR',
  name: 'Bitmine Immersion Technologies',
  assetClass: 'equity',
  taxonomy: { sector: 'Financials', industry: 'Digital Asset Treasury' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['mstr', 'iren'],
  summary:
    'A digital asset treasury and immersion-cooled mining company. Like other treasury vehicles it trades largely as a leveraged proxy for its underlying crypto holdings rather than on operating fundamentals.',
  solana: [{ mint: 'XsrBCwaH8c46xiqXBChzobgufRKxQxAWUWbndgBNzFn', issuer: 'Backed Finance' }],
  hyperliquid: ['BMNR'],
});
